/**
 * Settings-surface wiring for the ocr plugin: with a settings provider
 * mounted, the `tool-ocr` namespace registers, committed changes rebuild the
 * engine from the resolved section, and writes the plugin could not act on
 * are refused before anything persists.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as OcrPlugin from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

/** A plugin mount that exercises the product posture: settings provider + ocr. */
async function mount(config: OcrPlugin.Config): Promise<{ ctx: Context; settingsPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ocr-settings-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const settingsPath = join(dir, 'settings.yaml')
  const ctx = new Context()
  cleanups.push(async () => {
    await ctx.fiber.dispose()
  })
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FileSettingsProvider, { path: settingsPath, watch: false })
  await ctx.plugin(OcrPlugin, config)
  return { ctx, settingsPath }
}

describe('ocr settings namespace', () => {
  it('registers the namespace and rebuilds the engine from a committed change', async () => {
    const { ctx } = await mount({ command: 'nbocr', detModel: 'v6-tiny' })
    // The composition entry is the initial engine configuration.
    expect((await ctx.ocr.status()).modelType).toBe('v6-tiny')
    // A committed change rebuilds the engine from the resolved section.
    await ctx.settings.update(OcrPlugin.TOOL_OCR_SETTINGS_NAMESPACE, { detModel: 'v6-large' })
    expect((await ctx.ocr.status()).modelType).toBe('v6-large')
  })

  it('refuses a write the plugin could not act on and persists nothing', async () => {
    const { ctx, settingsPath } = await mount({ command: 'nbocr' })
    await expect(
      ctx.settings.update(OcrPlugin.TOOL_OCR_SETTINGS_NAMESPACE, { command: '   ' }),
    ).rejects.toThrow('command must be a non-empty string')
    await expect(
      ctx.settings.update(OcrPlugin.TOOL_OCR_SETTINGS_NAMESPACE, { maxTextChars: 0 }),
    ).rejects.toThrow('maxTextChars must be a positive integer')
    // The refusals persisted nothing: the user document stays empty and the
    // engine keeps serving the composition entry.
    // The refusals persisted nothing: with no user layer the provider never
    // wrote a document, so an absent file is the empty document.
    const stored = await readFile(settingsPath, 'utf8').catch(() => '')
    expect(stored).not.toContain('command')
    expect((await ctx.ocr.status()).modelType).toBe('v6-tiny')
  })
})
