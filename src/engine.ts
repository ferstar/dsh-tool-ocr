/**
 * nbocr engine driver: spawns the standalone `nbocr` (newbee-ocr) CLI, parses its JSON output,
 * and normalizes reading order, review flags, and heuristic table reconstruction. Robust against
 * MNN diagnostics polluting stdout (the JSON object is the only brace-delimited payload).
 * @module dsh-ocr/engine
 */

import { stat } from 'node:fs/promises'
import type { OcrRecognizeRequest, OcrRecognizeResult, OcrStatus } from './types.ts'
import { buildReview, buildTable, sortReadingOrder, truncateMainText } from './postprocess.ts'

/** A minimal 1x1 transparent PNG used to probe the engine end to end. */
const PROBE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

export const NBOCR_ENGINE = 'nbocr'
export const NBOCR_OCR_VERSION = 'PP-OCRv6'
export const NBOCR_RUNTIME = 'mnn-cpu'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.gif', '.tif', '.tiff'])

/** Engine process bounds and model selection. */
export interface EngineConfig {
  /** The nbocr executable: absolute path or PATH-resolved name. Required. */
  command: string
  /** Extra arguments before the nbocr subcommand. Default `[]`. */
  args?: readonly string[]
  /** Extra environment entries. Default `{}`. */
  env?: Readonly<Record<string, string>>
  /** Recognition model/language alias. Default `chinese`. */
  language?: string
  /** Detection model tier. Default `v6-tiny`. */
  detModel?: string
  /** Model directory for non-embedded models; empty uses embedded models. */
  modelsDir?: string
  /** Largest accepted image in bytes. Default 25 MiB. */
  maxImageBytes?: number
  /** Largest collected engine stdout in bytes. Default 2 MiB. */
  maxOutputBytes?: number
}

/** Engine configuration with defaults filled. */
export type ResolvedEngineConfig = Required<Omit<EngineConfig, 'args' | 'env'>> & {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** Resolve engine config defaults. */
export function resolveEngineConfig(config: EngineConfig): ResolvedEngineConfig {
  return {
    command: config.command,
    args: config.args ?? [],
    env: config.env ?? {},
    language: config.language ?? 'chinese',
    detModel: config.detModel ?? 'v6-tiny',
    modelsDir: config.modelsDir ?? '',
    maxImageBytes: config.maxImageBytes ?? 25 * 1024 * 1024,
    maxOutputBytes: config.maxOutputBytes ?? 2 * 1024 * 1024,
  }
}

/** The spawn interface the engine driver needs; the plugin supplies `ctx.subprocess`. */
export interface Spawner {
  spawn(spec: {
    argv: readonly string[]
    cwd: string
    stdio: {
      stdin: 'ignore'
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
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

/** Extract the JSON document from engine stdout polluted by MNN diagnostics. */
export function extractJsonDocument(stdout: string): string | undefined {
  const firstBrace = stdout.indexOf('{')
  if (firstBrace < 0) return undefined
  const lastBrace = stdout.lastIndexOf('}')
  if (lastBrace <= firstBrace) return undefined
  return stdout.slice(firstBrace, lastBrace + 1)
}

/** One `nbocr` text region as emitted on stdout. */
export interface NbocrTextRegion {
  readonly text: string
  readonly confidence: number
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

/** The `nbocr recognize -f json` top-level document. */
export interface NbocrOutput {
  readonly file: string
  readonly results: readonly NbocrTextRegion[]
  readonly time_ms?: number
}

/** Build the `nbocr recognize` argv. */
export function nbocrRecognizeArgv(
  imagePath: string,
  language: string,
  detModel: string,
  modelsDir: string | null,
): string[] {
  const argv = ['recognize', imagePath, '-l', language, '-d', detModel, '-f', 'json', '--timing']
  if (modelsDir !== null) argv.push('-m', modelsDir)
  return argv
}

/** Structured OCR failure with a stable code. */
export class OcrEngineError extends Error {
  readonly code: string
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'OcrEngineError'
    this.code = code
  }
}

/** Validate an image path before handing it to the engine. */
export async function validateImagePath(path: string, maxBytes: number, signal: AbortSignal): Promise<void> {
  let info
  try {
    info = await stat(path)
  } catch (error: unknown) {
    throw new OcrEngineError(`image not found: ${path} (${String(error)})`, 'OCR_INVALID_IMAGE')
  }
  if (signal.aborted) throw signal.reason
  if (!info.isFile()) throw new OcrEngineError(`not a file: ${path}`, 'OCR_INVALID_IMAGE')
  if (info.size > maxBytes) {
    throw new OcrEngineError(`image too large (${info.size} bytes, max ${maxBytes})`, 'OCR_INVALID_IMAGE')
  }
  const lower = path.toLowerCase()
  const extension = lower.split('.').pop()
  const hasExtension = extension !== undefined && IMAGE_EXTENSIONS.has('.' + extension)
  if (!hasExtension) throw new OcrEngineError(`unsupported image type: ${path}`, 'OCR_INVALID_IMAGE')
}

/** The nbocr-backed OCR implementation. Each recognition spawns one engine process. */
export class NbocrEngine {
  constructor(
    private readonly config: ResolvedEngineConfig,
    private readonly spawner: Spawner,
  ) {}

  async recognize(request: OcrRecognizeRequest, signal?: AbortSignal): Promise<OcrRecognizeResult> {
    await validateImagePath(request.path, this.config.maxImageBytes, signal ?? new AbortController().signal)
    const started = Date.now()
    const stdout = await this.runEngine(request.path, signal)
    const elapsedMs = Date.now() - started

    const jsonDocument = extractJsonDocument(stdout)
    if (jsonDocument === undefined) {
      throw new OcrEngineError('engine returned no JSON document', 'OCR_MALFORMED_RESPONSE')
    }
    let document: NbocrOutput
    try {
      document = JSON.parse(jsonDocument) as NbocrOutput
    } catch (error: unknown) {
      throw new OcrEngineError(`engine returned malformed JSON: ${String(error)}`, 'OCR_MALFORMED_RESPONSE')
    }

    const raw = document.results.map(region => ({
      text: region.text,
      confidence: region.confidence,
      rect: { x: region.bbox.x, y: region.bbox.y, width: region.bbox.width, height: region.bbox.height },
    }))
    const ordered = sortReadingOrder(raw)
    const mainText = ordered
      .filter(block => block.confidence >= 0.7 && block.text.trim().length > 0)
      .map(block => block.text)
      .join('\n')
    const { text, truncated } = truncateMainText(mainText, request.maxTextChars)
    const review = buildReview(raw, request.maxTextChars)
    const table = request.table ? buildTable(raw) : undefined
    return {
      text,
      blocks: request.includeBoxes ? ordered.map(block => ({
        text: block.text,
        confidence: block.confidence,
        bbox: rectToBbox(block.rect),
        center: block.center,
      })) : [],
      engine: NBOCR_ENGINE,
      runtime: NBOCR_RUNTIME,
      ocrVersion: NBOCR_OCR_VERSION,
      modelType: this.config.detModel,
      elapsedMs,
      orientationDegrees: 0,
      truncated,
      review,
      ...table === undefined ? {} : { table },
    }
  }

  status(): OcrStatus {
    return {
      installed: true,
      ready: false,
      modelsReady: false,
      loaded: false,
      missingModels: [],
      ownerId: 'dsh-ocr-nbocr',
      engine: NBOCR_ENGINE,
      runtime: NBOCR_RUNTIME,
      version: 'newbee-ocr',
      ocrVersion: NBOCR_OCR_VERSION,
      modelType: this.config.detModel,
    }
  }

  async check(signal?: AbortSignal): Promise<OcrStatus> {
    try {
      await this.probe(signal)
      return { ...this.status(), ready: true, modelsReady: true, loaded: true }
    } catch (error: unknown) {
      return { ...this.status(), ready: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Run one recognition spawn and return collected stdout. */
  private async runEngine(imagePath: string, signal?: AbortSignal): Promise<string> {
    const argv = nbocrRecognizeArgv(
      imagePath,
      this.config.language,
      this.config.detModel,
      this.config.modelsDir.length > 0 ? this.config.modelsDir : null,
    )
    const handle = this.spawner.spawn({
      argv: [this.config.command, ...this.config.args, ...argv],
      cwd: process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: this.config.maxOutputBytes },
        stderr: { maxBytes: this.config.maxOutputBytes },
      },
      graceMs: 5_000,
      ...signal === undefined ? {} : { signal },
      ...Object.keys(this.config.env).length > 0 ? { env: this.config.env } : {},
    })
    const outcome = await handle.done
    if (signal?.aborted) throw signal.reason
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    if (outcome.exitCode !== 0) {
      const detail = stderr.trim() || `exit code ${String(outcome.exitCode)}`
      throw new OcrEngineError(`engine failed: ${detail}`, 'OCR_ENGINE_FAILED')
    }
    if (stdout.trim().length === 0) {
      throw new OcrEngineError('engine returned no output', 'OCR_MALFORMED_RESPONSE')
    }
    return stdout
  }

  /** Write a probe PNG and run a real recognition end to end. */
  private async probe(signal?: AbortSignal): Promise<void> {
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'dsh-ocr-probe-'))
    const probePath = join(dir, 'probe.png')
    try {
      await writeFile(probePath, PROBE_PNG)
      await this.runEngine(probePath, signal)
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

/** Convert a rectangle to the four-corner bbox in reading order. */
function rectToBbox(rect: { x: number; y: number; width: number; height: number }): OcrRecognizeResult['blocks'][number]['bbox'] {
  const left = rect.x
  const top = rect.y
  const right = left + rect.width
  const bottom = top + rect.height
  return [[left, top], [right, top], [right, bottom], [left, bottom]]
}