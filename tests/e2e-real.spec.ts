import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.ts'

/**
 * Real-engine smoke: runs the full plugin (service + tool) against the actual `nbocr` binary.
 * Requires NBOCR_BIN and OCR_E2E_IMAGE env vars; skips otherwise.
 */
const nbocrBin = process.env.NBOCR_BIN ?? ''
const imagePath = process.env.OCR_E2E_IMAGE ?? ''
const enabled = nbocrBin.length > 0 && existsSync(nbocrBin) && imagePath.length > 0 && existsSync(imagePath)

describe.skipIf(!enabled)('real nbocr engine', () => {
  it('recognizes a real image through the plugin service and tool', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin({ apply, name: 'dsh-ocr', inject: ['tools', 'subprocess', 'systemPrompt'] }, {
      command: nbocrBin,
      detModel: 'v6-tiny',
      language: 'chinese',
    })

    const status = await ctx.ocr.status()
    expect(status.installed).toBe(true)

    const check = await ctx.ocr.check()
    expect(check.ready).toBe(true)

    const result = await ctx.ocr.recognize({
      path: imagePath,
      includeBoxes: true,
      table: false,
      maxTextChars: 200,
    })
    expect(result.text.length).toBeGreaterThan(0)
    expect(result.engine).toBe('nbocr')
    expect(result.blocks.length).toBeGreaterThan(0)

    const toolResult = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: 'e2e-1' as never,
      name: 'ocr',
      arguments: { path: imagePath, include_boxes: true },
      agent: { session: { header: { cwd: process.cwd() } } } as never,
    })
    expect(toolResult.isError).toBe(false)
    const block = toolResult.content[0]
    expect(block?.type === 'text' ? block.text : '').toContain('<text>')

    await ctx.fiber.dispose()
  })
})