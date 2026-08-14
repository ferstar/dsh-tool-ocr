import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildReview,
  buildTable,
  extractJsonDocument,
  nbocrRecognizeArgv,
  sortReadingOrder,
  truncateMainText,
} from '../src/index.ts'
import { NbocrEngine, resolveEngineConfig } from '../src/engine.ts'
import type { Spawner } from '../src/engine.ts'
import type { OcrRecognizeRequest } from '../src/types.ts'

function block(text: string, confidence: number, left: number, top: number, right: number) {
  return { text, confidence, rect: { x: left, y: top, width: right - left, height: 12 } }
}

describe('postprocess', () => {
  it('sorts reading order by row then column', () => {
    const ordered = sortReadingOrder([
      block('右', 0.99, 80, 0, 100),
      block('左', 0.99, 0, 1, 20),
    ])
    expect(ordered.map(item => item.text)).toEqual(['左', '右'])
  })

  it('flags low confidence and amount-like review items', () => {
    const review = buildReview([
      block('正常文本', 0.99, 0, 0, 100),
      block('低置信度金额 123.45 元', 0.42, 0, 20, 100),
    ], 12_000)
    expect(review.needsReview).toBe(true)
    expect(review.lowConfidence.map(item => item.text)).toEqual(['低置信度金额 123.45 元'])
    expect(review.amountLike.map(item => item.text)).toEqual(['低置信度金额 123.45 元'])
  })

  it('reconstructs a markdown table from header anchors', () => {
    const table = buildTable([
      block('Item', 0.99, 0, 0, 40),
      block('Price', 0.99, 80, 0, 130),
      block('Widget', 0.99, 0, 20, 50),
      block('9.99', 0.99, 80, 20, 120),
    ])
    expect(table?.markdown).toBe('| Item | Price |\n| --- | --- |\n| Widget | 9.99 |')
  })

  it('truncates main text without a marker', () => {
    expect(truncateMainText('一二三四五六七八九', 8)).toEqual({ text: '一二三四五六七八', truncated: true })
  })
})

describe('engine output parsing', () => {
  it('extracts the JSON document from stdout polluted by MNN diagnostics', () => {
    expect(extractJsonDocument('{"file":"a.png","results":[],"time_ms":1}\nThe device supports: i8sdot:0\n'))
      .toBe('{"file":"a.png","results":[],"time_ms":1}')
    expect(extractJsonDocument('no json')).toBeUndefined()
  })

  it('builds the recognize argv', () => {
    expect(nbocrRecognizeArgv('/tmp/a.png', 'chinese', 'v6-tiny', null)).toEqual([
      'recognize', '/tmp/a.png', '-l', 'chinese', '-d', 'v6-tiny', '-f', 'json', '--timing',
    ])
  })
})

describe('NbocrEngine', () => {
  function fixtureSpawner(json: string, exitCode = 0): Spawner {
    return {
      spawn(_spec) {
        const collected = { stdout: { readFrom: () => ({ text: json + '\n' }) }, stderr: { readFrom: () => ({ text: '' }) } }
        return {
          done: Promise.resolve({ exitCode }),
          collected,
        }
      },
    }
  }

  it('recognizes through a fixture spawner', async () => {
    const engine = new NbocrEngine(resolveEngineConfig({ command: 'nbocr' }), fixtureSpawner(JSON.stringify({
      file: 'a.png',
      results: [
        { text: 'first line', confidence: 0.99, bbox: { x: 0, y: 0, width: 100, height: 12 } },
        { text: 'second line', confidence: 0.91, bbox: { x: 0, y: 30, width: 120, height: 12 } },
      ],
      time_ms: 5,
    })))
    const root = await mkdtemp(join(tmpdir(), 'dsh-ocr-'))
    const image = join(root, 'shot.png')
    await writeFile(image, Buffer.from('89504e470d0a1a0a', 'hex'))
    try {
      const request: OcrRecognizeRequest = { path: image, includeBoxes: true, table: true, maxTextChars: 100 }
      const result = await engine.recognize(request)
      expect(result.text).toBe('first line\nsecond line')
      expect(result.blocks).toHaveLength(2)
      expect(result.engine).toBe('nbocr')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports engine failure as OcrEngineError', async () => {
    const engine = new NbocrEngine(
      resolveEngineConfig({ command: 'nbocr' }),
      fixtureSpawner('', 1),
    )
    const root = await mkdtemp(join(tmpdir(), 'dsh-ocr-'))
    const image = join(root, 'shot.png')
    await writeFile(image, Buffer.from('89504e470d0a1a0a', 'hex'))
    try {
      await expect(engine.recognize({ path: image, includeBoxes: false, table: false, maxTextChars: 100 }))
        .rejects.toMatchObject({ code: 'OCR_ENGINE_FAILED' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects unsupported image types', async () => {
    const engine = new NbocrEngine(resolveEngineConfig({ command: 'nbocr' }), fixtureSpawner('{}'))
    await expect(engine.recognize({ path: '/tmp/a.txt', includeBoxes: false, table: false, maxTextChars: 100 }))
      .rejects.toMatchObject({ code: 'OCR_INVALID_IMAGE' })
  })
})