/**
 * OCR result post-processing, ported from tailos-core `tailos-tools/src/ocr/postprocess.rs`:
 * reading-order clustering, heuristic Markdown table reconstruction, and human-review guidance.
 * Pure functions over engine output.
 * @module dsh-ocr/postprocess
 */

const LOW_CONFIDENCE_THRESHOLD = 0.9
const MAIN_TEXT_CONFIDENCE_THRESHOLD = 0.7
const REVIEW_ITEM_TEXT_CAP = 160
const TRUNCATION_MARKER = '...'

/** A raw engine block: text plus its rectangle in image pixels. */
export interface RawBlock {
  readonly text: string
  readonly confidence: number
  readonly rect: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

/** A block with reading-order position. */
export interface PositionedBlock extends RawBlock {
  readonly center: readonly [number, number]
  readonly row: number
  readonly column: number
}

interface TableRow {
  y: number
  blocks: Array<RawBlock & { center: readonly [number, number] }>
}

/** Cluster blocks into reading rows, then order each row left to right. */
export function sortReadingOrder(blocks: readonly RawBlock[]): PositionedBlock[] {
  const positioned: Array<RawBlock & { center: readonly [number, number] }> = blocks.map(block => ({
    ...block,
    center: [block.rect.x + block.rect.width / 2, block.rect.y + block.rect.height / 2] as const,
  }))
  positioned.sort((left, right) => {
    const dy = left.center[1] - right.center[1]
    return dy !== 0 ? dy : left.center[0] - right.center[0]
  })
  if (positioned.length === 0) return []

  const heights = positioned
    .filter(block => block.confidence >= MAIN_TEXT_CONFIDENCE_THRESHOLD)
    .map(block => block.rect.height)
    .filter(height => Number.isFinite(height) && height > 0)
  const sortedHeights = [...heights].sort((a, b) => a - b)
  const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] ?? 0
  const threshold = Math.max(12, medianHeight * 0.7)

  const rows: TableRow[] = []
  for (const block of positioned) {
    const y = block.center[1]
    const last = rows.at(-1)
    if (last !== undefined && Math.abs(last.y - y) <= threshold) {
      last.blocks.push(block)
      last.y = last.blocks.reduce((sum, item) => sum + item.center[1], 0) / last.blocks.length
    } else {
      rows.push({ y, blocks: [block] })
    }
  }

  const result: PositionedBlock[] = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (row === undefined) continue
    row.blocks.sort((left, right) => left.center[0] - right.center[0])
    for (let column = 0; column < row.blocks.length; column += 1) {
      const block = row.blocks[column]
      if (block === undefined) continue
      result.push({ ...block, row: rowIndex, column })
    }
  }
  return result
}

/** Truncate to at most `limit` characters, appending the marker when truncated. */
export function truncateText(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false }
  if (limit <= TRUNCATION_MARKER.length) return { text: value.slice(0, limit), truncated: true }
  const retained = limit - TRUNCATION_MARKER.length
  return { text: value.slice(0, retained) + TRUNCATION_MARKER, truncated: true }
}

/** Truncate main text to at most `limit` characters without a marker. */
export function truncateMainText(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: value.slice(0, limit), truncated: true }
}

const CURRENCY_PATTERN = /(?:¥|￥|\$|€|£|港币|港幣|人民币|人民幣|美元|欧元|歐元|日元|元|HKD|CNY|RMB|USD|EUR|JPY|GBP)/i
const AMOUNT_CONTEXT_PATTERN =
  /(?:金额|金額|总价|總價|单价|單價|价格|價格|报价|報價|费用|費用|小计|小計|合计|合計|总计|總計|付款|支付|余额|餘額|balance|amount|total|subtotal|price|fee|cost|payable)/i
const NUMERIC_TOKEN_PATTERN =
  new RegExp(
    '[+-]?\\(?(?:(?:\\d{1,3}(?:[\\s,.\'，．]\\d{3})+(?:[.,，．]\\d{1,4})?)|(?:\\d+(?:[.,，．]\\d{1,4})?)|(?:[.,，．]\\d{1,4}))\\)?' +
    '(?:\\s*(?:万|萬|亿|億|千|百|%|％|元|角|分|卡|台|套|个|個|件|人|天|月|年|GB|MB|TB|USD|EUR|HKD|CNY|RMB|JPY|GBP))?',
    'g',
  )
const THOUSANDS_PATTERN = /\d[\s,.'，．]\d{3}/
const DECIMAL_CENTS_PATTERN = /[.,，．]\d{2}(?:\D|$)/
const DATE_PATTERN =
  new RegExp(
    '(?:\\d{4}[年/-]\\d{1,2}[月/-]\\d{1,2}日?)|(?:\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)' +
    '|(?:\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{2,4})|(?:[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{2,4})',
    'i',
  )
const PERCENT_PATTERN = /\d+(?:[.,，．]\d+)?\s*(?:%|％)/
const QUANTITY_PATTERN = /\d+(?:[.,，．]\d+)?\s*(?:卡|台|套|个|個|件|人|天|月|年|GB|MB|TB)/i
const QUANTITY_CONTEXT_PATTERN = /(?:数量|數量|授权|授權|license|节点|節點|折扣|税率|稅率|比例|percent|rate|qty|quantity|count)/i

/** Extract standalone numeric tokens from text. */
export function numericTokens(text: string): string[] {
  const tokens: string[] = []
  for (const match of text.matchAll(NUMERIC_TOKEN_PATTERN)) {
    const token = match[0].trim()
    if (token.length === 0) continue
    const previous = text.slice(0, match.index).at(-1)
    const next = text.slice(match.index + token.length).at(0)
    if (previous !== undefined && /[A-Za-z0-9]/.test(previous)) continue
    if (next !== undefined && /[A-Za-z0-9]/.test(next)) continue
    tokens.push(token)
  }
  return tokens
}

function looksAmountLike(text: string): boolean {
  const numbers = numericTokens(text)
  if (numbers.length === 0) return false
  if (CURRENCY_PATTERN.test(text) || AMOUNT_CONTEXT_PATTERN.test(text)) return true
  return numbers.some(number => THOUSANDS_PATTERN.test(number) || DECIMAL_CENTS_PATTERN.test(number))
}

function looksNumericLike(text: string): boolean {
  return numericTokens(text).length > 0
    || DATE_PATTERN.test(text)
    || PERCENT_PATTERN.test(text)
    || QUANTITY_PATTERN.test(text)
}

function looksDateLike(text: string): boolean {
  return DATE_PATTERN.test(text)
}

function looksQuantityLike(text: string): boolean {
  return QUANTITY_PATTERN.test(text)
    || PERCENT_PATTERN.test(text)
    || (QUANTITY_CONTEXT_PATTERN.test(text) && numericTokens(text).length > 0)
}

export interface ReviewItem {
  readonly index: number
  readonly text: string
  readonly textTruncated: boolean
  readonly confidence: number
}

export interface Review {
  readonly lowConfidence: readonly ReviewItem[]
  readonly amountLike: readonly ReviewItem[]
  readonly numericLike: readonly ReviewItem[]
  readonly dateLike: readonly ReviewItem[]
  readonly quantityLike: readonly ReviewItem[]
  readonly needsReview: boolean
}

function reviewItem(index: number, text: string, confidence: number, maxTextChars: number): ReviewItem {
  const limit = Math.min(Math.max(maxTextChars, 1), REVIEW_ITEM_TEXT_CAP)
  const { text: truncated, truncated: textTruncated } = truncateText(text, limit)
  return {
    index,
    text: truncated,
    textTruncated,
    confidence: Math.round(confidence * 10_000) / 10_000,
  }
}

/** Build review guidance from blocks. */
export function buildReview(blocks: readonly RawBlock[], maxTextChars: number): Review {
  const lowConfidence: ReviewItem[] = []
  const amountLike: ReviewItem[] = []
  const numericLike: ReviewItem[] = []
  const dateLike: ReviewItem[] = []
  const quantityLike: ReviewItem[] = []

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block === undefined) continue
    if (block.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidence.push(reviewItem(index, block.text, block.confidence, maxTextChars))
    }
    if (looksAmountLike(block.text)) amountLike.push(reviewItem(index, block.text, block.confidence, maxTextChars))
    if (looksNumericLike(block.text)) numericLike.push(reviewItem(index, block.text, block.confidence, maxTextChars))
    if (looksDateLike(block.text)) dateLike.push(reviewItem(index, block.text, block.confidence, maxTextChars))
    if (looksQuantityLike(block.text)) quantityLike.push(reviewItem(index, block.text, block.confidence, maxTextChars))
  }

  return {
    lowConfidence,
    amountLike,
    numericLike,
    dateLike,
    quantityLike,
    needsReview: lowConfidence.length > 0 || amountLike.length > 0 || numericLike.length > 0,
  }
}

function columnAnchors(header: TableRow): number[] | undefined {
  const anchors = header.blocks.map(block => block.center[0])
  if (anchors.length < 2) return undefined
  for (let i = 1; i < anchors.length; i += 1) {
    const previous = anchors[i - 1]
    const current = anchors[i]
    if (previous === undefined || current === undefined || current <= previous) return undefined
  }
  return anchors
}

function assignRowToColumns(blocks: ReadonlyArray<RawBlock & { center: readonly [number, number] }>, anchors: readonly number[]): string[] | undefined {
  if (anchors.length < 2 || blocks.length > anchors.length) return undefined
  const boundaries: number[] = []
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const left = anchors[i]
    const right = anchors[i + 1]
    if (left === undefined || right === undefined) return undefined
    boundaries.push((left + right) / 2)
  }
  const firstAnchor = anchors[0]
  const secondAnchor = anchors[1]
  const lastAnchor = anchors[anchors.length - 1]
  const secondLastAnchor = anchors[anchors.length - 2]
  if (firstAnchor === undefined || secondAnchor === undefined || lastAnchor === undefined || secondLastAnchor === undefined) {
    return undefined
  }
  const leftEdge = firstAnchor - (secondAnchor - firstAnchor) / 2
  const rightEdge = lastAnchor + (lastAnchor - secondLastAnchor) / 2
  const cells = anchors.map(() => '')
  let lastColumn = 0

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block === undefined) return undefined
    const x = block.center[0]
    if (x < leftEdge || x > rightEdge) return undefined
    const column = boundaries.filter(boundary => x >= boundary).length
    if (index > 0 && column < lastColumn) return undefined
    const escaped = block.text.replace(/\|/g, '\\|')
    const existing = cells[column]
    cells[column] = existing === undefined || existing.length === 0 ? escaped : `${existing} ${escaped}`
    lastColumn = column
  }
  return cells
}

export interface OcrTable {
  readonly markdown: string
  readonly rowCount: number
  readonly maxColumns: number
  readonly note: string
}

/** Build a Markdown table from blocks when geometry forms a table-like layout. */
export function buildTable(blocks: readonly RawBlock[]): OcrTable | undefined {
  const positioned = sortReadingOrder(blocks)
  if (positioned.length === 0) return undefined
  const rows: TableRow[] = []
  for (const block of positioned) {
    const last = rows.at(-1)
    if (last !== undefined && last.y === block.row) {
      last.blocks.push(block)
    } else {
      rows.push({ y: block.row, blocks: [block] })
    }
  }
  if (rows.length < 2) return undefined
  const maxColumns = Math.max(...rows.map(row => row.blocks.length))
  const tableishRows = rows.filter(row => row.blocks.length >= 2).length
  const firstRow = rows[0]
  if (firstRow === undefined) return undefined
  if (maxColumns < 2 || tableishRows < 2 || firstRow.blocks.length !== maxColumns) return undefined
  const anchors = columnAnchors(firstRow)
  if (anchors === undefined) return undefined
  const normalized: string[][] = []
  for (const row of rows) {
    const cells = assignRowToColumns(row.blocks, anchors)
    if (cells === undefined) return undefined
    normalized.push(cells)
  }
  const header = normalized[0]
  if (header === undefined) return undefined
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...normalized.slice(1).map(row => `| ${row.join(' | ')} |`),
  ]
  return {
    markdown: lines.join('\n'),
    rowCount: rows.length,
    maxColumns,
    note: 'Heuristic layout reconstruction from OCR boxes; verify table structure before using as source of truth.',
  }
}