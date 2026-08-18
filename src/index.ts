/**
 * Standalone `ocr` plugin for DeepSeek Harness: local image text recognition for models without
 * vision input, backed by the standalone `nbocr` (newbee-ocr) engine over PP-OCRv6 models.
 *
 * Mounted as a Cordis plugin, it registers the `ocr` service (`ctx.ocr`) and the model-facing
 * `ocr` tool. `recognize` accepts either `path` (resolved against the session cwd) or
 * `attachment_id` (an image already attached to the conversation, materialized to a temp file).
 *
 * Depends only on published dsh base packages — this plugin is fully out-of-tree.
 * @module dsh-ocr
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { NbocrEngine, OcrEngineError, resolveEngineConfig } from './engine.ts'
import type { EngineConfig, Spawner } from './engine.ts'
import type { OcrRecognizeResult, OcrStatus } from './types.ts'
import {
  DEFAULT_MAX_TEXT_CHARS,
  DEFAULT_OCR_TIMEOUT_MS,
  formatRecognitionText,
  formatStatusText,
  OCR_ACTIONS,
  OCR_PROMPT_TEXT,
} from './render.ts'

export { NbocrEngine, OcrEngineError, extractJsonDocument, nbocrRecognizeArgv, resolveEngineConfig, validateImagePath } from './engine.ts'
export type { EngineConfig, NbocrOutput, NbocrTextRegion, Spawner } from './engine.ts'
export type { OcrBlock, OcrRecognizeRequest, OcrRecognizeResult, OcrReview, OcrReviewItem, OcrStatus, OcrTable } from './types.ts'
export { buildReview, buildTable, numericTokens, sortReadingOrder, truncateMainText, truncateText } from './postprocess.ts'
export { DEFAULT_MAX_TEXT_CHARS, DEFAULT_OCR_TIMEOUT_MS, formatRecognitionText, formatStatusText, OCR_ACTIONS, OCR_PROMPT_TEXT } from './render.ts'

/** Cordis plugin name for loader diagnostics. */
export const name = 'tool-ocr'

/**
 * The plugin's settings namespace: the join key between the Host settings
 * section and the browser configuration card. Lowercase kebab-case, matching
 * the plugin short name.
 */
export const TOOL_OCR_SETTINGS_NAMESPACE = settingsNamespace('tool-ocr')

/** Services required by this plugin. */
export const inject = ['tools', 'subprocess', 'systemPrompt']

/** Plugin configuration: engine selection and run bounds. */
export interface Config extends Omit<EngineConfig, 'args' | 'env'> {
  /** Extra arguments before the nbocr subcommand. Default `[]`. */
  args?: string[]
  /** Extra environment entries. Default `{}`. */
  env?: Record<string, string>
  /** Largest recognized text returned in `text` (default 12000). */
  maxTextChars?: number
  /** Tool-call timeout budget in ms (default 600000). */
  timeoutMs?: number
}

/** Schemastery config schema validated by the Cordis loader. */
export const Config: z<Config> = z.object({
  command: z.string().required(),
  args: z.array(String).default([]),
  env: z.dict(String).default({}),
  language: z.string().default('chinese'),
  detModel: z.string().default('v6-tiny'),
  modelsDir: z.string().default(''),
  maxImageBytes: z.number().default(25 * 1024 * 1024),
  maxOutputBytes: z.number().default(2 * 1024 * 1024),
  maxTextChars: z.number().default(DEFAULT_MAX_TEXT_CHARS),
  timeoutMs: z.number().default(DEFAULT_OCR_TIMEOUT_MS),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    ocr: OcrService
    subprocess: {
      spawn(spec: {
        argv: readonly string[]
        cwd: string
        stdio: {
          stdin: 'ignore' | 'pipe'
          stdout: { maxBytes: number } | 'pipe' | 'inherit'
          stderr: { maxBytes: number } | 'pipe' | 'inherit'
        }
        graceMs: number
        signal?: AbortSignal
        env?: Readonly<Record<string, string>>
      }): {
        done: Promise<{ exitCode: number | null }>
        collected: {
          stdout?: { readFrom(from: number): { text: string } }
          stderr?: { readFrom(from: number): { text: string } }
        }
      }
    }
  }
}

/** The OCR service contract the tool consumes. */
export interface OcrService {
  recognize(request: {
    path: string
    includeBoxes: boolean
    table: boolean
    maxTextChars: number
  }, signal?: AbortSignal): Promise<OcrRecognizeResult>
  status(): Promise<OcrStatus>
  check(signal?: AbortSignal): Promise<OcrStatus>
}

/**
 * Register the `ocr` service and tool.
 * @param ctx - the plugin context (injects `tools`, `subprocess`, `systemPrompt`).
 * @param config - resolved plugin configuration.
 */
/**
 * Reject a resolved configuration the plugin could not act on — the checks
 * schemastery cannot express. Shared by the composition mount and the
 * settings write path, so a value refused by one is refused by both.
 * @param value - the configuration to judge.
 */
function validateOcrConfig(value: Config): void {
  if (value.command.trim() === '') throw new Error('dsh-ocr: command must be a non-empty string')
  const maxTextChars = value.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS
  const timeoutMs = value.timeoutMs ?? DEFAULT_OCR_TIMEOUT_MS
  if (!Number.isInteger(maxTextChars) || maxTextChars < 1) {
    throw new Error('dsh-ocr: maxTextChars must be a positive integer')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('dsh-ocr: timeoutMs must be a positive integer')
  }
}

export function apply(ctx: Context, config: Config): void {
  validateOcrConfig(config)

  const spawner: Spawner = {
    spawn: spec => ctx.subprocess.spawn(spec as never),
  }
  // The engine is rebuilt from the active configuration source: the settings
  // scope while a provider is mounted, the composition entry otherwise.
  let current: () => Config = () => config
  const activeMaxTextChars = (): number => current().maxTextChars ?? DEFAULT_MAX_TEXT_CHARS
  let engine = new NbocrEngine(resolveEngineConfig(config), spawner)
  const service: OcrService = {
    recognize: (request, signal) => engine.recognize(request, signal),
    status: () => Promise.resolve(engine.status()),
    check: signal => engine.check(signal),
  }
  ctx.provide('ocr', service)

  // Browser-configurable settings: while a settings provider is mounted, the
  // `tool-ocr` namespace layers the composition entry as its base and every
  // committed change rebuilds the engine from the resolved section.
  installSettingsSection(ctx, TOOL_OCR_SETTINGS_NAMESPACE, Config, config, {
    validate: validateOcrConfig,
    setSource: (source) => {
      current = source
    },
    onChange: () => {
      engine = new NbocrEngine(resolveEngineConfig(current()), spawner)
    },
  })

  ctx.systemPrompt.section({ name: 'tool:ocr', order: 113, text: OCR_PROMPT_TEXT })

  ctx.tools.register(defineTool({
    name: 'ocr',
    description:
      'Extract and recognize text from a local image file or an image attached to the conversation, using local OCR. ' +
      'Use this when the current model cannot directly inspect images. ' +
      'action is recognize (default when path or attachment_id is present), status, install (alias of check), or check.',
    parameters: {
      path: { type: 'string', description: 'Path to the local image file, resolved against the session workspace.' },
      attachment_id: {
        type: 'string',
        description: 'Opaque id of an image already attached to the conversation (as shown in the message text).',
      },
      action: {
        type: 'string',
        enum: [...OCR_ACTIONS],
        description: 'OCR action. Defaults to recognize when path or attachment_id is present, otherwise status.',
      },
      include_boxes: { type: 'boolean', description: 'Whether to include per-text-block bounding boxes. Defaults to false.' },
      table: { type: 'boolean', description: 'Whether to include a heuristic Markdown table reconstruction. Defaults to false.' },
      max_text_chars: { type: 'number', description: 'Maximum recognized text characters to return. Defaults to 12000.' },
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'recognize' },
              result: { type: 'object', additionalProperties: true, required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'status' },
              status: { type: 'object', additionalProperties: true, required: true },
            },
          },
        ],
      },
      render: (_args, value) => [{ type: 'text', text: formatValue(value as never) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const action = resolveAction(args)
      if (action === 'status') {
        return { kind: 'status' as const, status: await service.status() } as unknown as never
      }
      if (action === 'check' || action === 'install') {
        return { kind: 'status' as const, status: await service.check(exec.signal) } as unknown as never
      }
      const imagePath = await resolveImagePath(ctx, exec, args)
      const result = await service.recognize({
        path: imagePath,
        includeBoxes: args.include_boxes === true,
        table: args.table === true,
        maxTextChars: args.max_text_chars !== undefined ? validatedMaxTextChars(args.max_text_chars) : activeMaxTextChars(),
      }, exec.signal)
      return { kind: 'recognize' as const, result } as unknown as never
    },
  }))
}

/** Resolve the action from arguments, defaulting to recognize when an image source is present. */
function resolveAction(args: {
  action?: string
  path?: string
  attachment_id?: string
}): 'recognize' | 'status' | 'check' | 'install' {
  if (args.action !== undefined) {
    if (!OCR_ACTIONS.includes(args.action)) {
      throw new OcrEngineError(`action must be one of ${OCR_ACTIONS.join(', ')}`, 'OCR_INVALID_IMAGE')
    }
    return args.action as 'recognize' | 'status' | 'check' | 'install'
  }
  return args.path !== undefined || args.attachment_id !== undefined ? 'recognize' : 'status'
}

/** Validate a model-supplied max_text_chars. */
function validatedMaxTextChars(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new OcrEngineError('max_text_chars must be a positive integer', 'OCR_INVALID_IMAGE')
  }
  return value
}

/** Resolve the image to recognize: attachment id becomes a temp file; path resolves against session cwd. */
async function resolveImagePath(
  ctx: Context,
  exec: ToolExecution,
  args: { path?: string; attachment_id?: string },
): Promise<string> {
  const hasPath = args.path !== undefined && args.path.trim().length > 0
  const hasAttachment = args.attachment_id !== undefined && args.attachment_id.trim().length > 0
  if (hasPath === hasAttachment) {
    throw new OcrEngineError('exactly one of path or attachment_id is required for recognize', 'OCR_INVALID_IMAGE')
  }
  if (hasAttachment) {
    return materializeAttachment(ctx, exec, args.attachment_id as string)
  }
  const path = args.path as string
  if (isAbsolute(path)) return path
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined) {
    throw new OcrEngineError('relative image path requires a session workspace', 'OCR_INVALID_IMAGE')
  }
  return join(cwd, path)
}

/** Materialize a session image attachment into a temp file for the engine. */
async function materializeAttachment(ctx: Context, exec: ToolExecution, attachmentId: string): Promise<string> {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) {
    throw new OcrEngineError('attachment_id requires the attachment service, which is not mounted', 'OCR_UNAVAILABLE')
  }
  const ref = findAttachmentRef(exec, attachmentId)
  if (ref === undefined) {
    throw new OcrEngineError(`no image attachment with id ${attachmentId} in this conversation`, 'OCR_INVALID_IMAGE')
  }
  const { data } = await attachments.readImage(ref, exec.signal)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ocr-'))
  try {
    const ext = extensionForMediaType(ref.mediaType)
    const file = join(dir, `attachment${ext}`)
    await writeFile(file, data, { signal: exec.signal })
    return file
  } catch (error: unknown) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/** Search the session log for an image attachment reference by opaque id. */
export function findAttachmentRef(exec: ToolExecution, attachmentId: string): ImageAttachmentRef | undefined {
  const session = exec.agent?.session
  if (session === undefined) return undefined
  for (const event of session.events) {
    const found = imageRefInEvent(event, ref => String(ref.attachmentId) === attachmentId)
    if (found !== undefined) return found
  }
  return undefined
}

/** Recurse into model-visible content carriers looking for an image reference. */
function imageRefInEvent(event: SessionEvent, match: (ref: ImageAttachmentRef) => boolean): ImageAttachmentRef | undefined {
  const data = event.data as {
    content?: unknown
    message?: { content?: unknown }
    inserted?: Array<{ content?: unknown }>
  }
  const direct = imageRefInContent(data.content, match)
  if (direct !== undefined) return direct
  if (data.message !== undefined) {
    const wrapped = imageRefInContent(data.message.content, match)
    if (wrapped !== undefined) return wrapped
  }
  if (data.inserted !== undefined) {
    for (const message of data.inserted) {
      const inserted = imageRefInContent(message.content, match)
      if (inserted !== undefined) return inserted
    }
  }
  return undefined
}

/** Search one content array for an image block with a matching attachment reference. */
function imageRefInContent(content: unknown, match: (ref: ImageAttachmentRef) => boolean): ImageAttachmentRef | undefined {
  if (!Array.isArray(content)) return undefined
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value as { type?: unknown; attachment?: unknown; content?: unknown }
    if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = block.attachment as ImageAttachmentRef
      if (match(ref)) return ref
    }
    const nested = imageRefInContent(block.content, match)
    if (nested !== undefined) return nested
  }
  return undefined
}

/** Map an attachment media type to a file extension the OCR engine accepts. */
function extensionForMediaType(mediaType: ImageAttachmentRef['mediaType']): string {
  switch (mediaType) {
    case 'image/jpeg': return '.jpg'
    case 'image/webp': return '.webp'
    case 'image/gif': return '.gif'
    default: return '.png'
  }
}

/** Render the canonical value for the model. */
function formatValue(value: unknown): string {
  const v = value as { kind?: string; result?: OcrRecognizeResult; status?: OcrStatus }
  return v.kind === 'recognize' && v.result !== undefined
    ? formatRecognitionText(v.result)
    : v.status !== undefined
      ? formatStatusText(v.status)
      : 'unknown OCR outcome'
}