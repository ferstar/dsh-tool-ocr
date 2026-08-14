/**
 * Standalone OCR plugin vocabulary: recognition request, result, status, and error taxonomy.
 * Self-contained — this plugin depends only on published dsh base packages, never on an
 * in-repo OCR package.
 * @module dsh-ocr/types
 */

/** One OCR text block: recognized text, confidence, and the four-corner bounding box. */
export interface OcrBlock {
  /** Recognized text. */
  readonly text: string
  /** Confidence in [0, 1]. */
  readonly confidence: number
  /** Four-corner bounding box as [x, y] pixel pairs in reading order. */
  readonly bbox: Readonly<[[number, number], [number, number], [number, number], [number, number]]>
  /** Bounding box center as [x, y] pixels. */
  readonly center: readonly [number, number]
}

/** One block that needs human review. */
export interface OcrReviewItem {
  /** Index of the block in the provider's returned block list. */
  readonly index: number
  /** Block text, truncated to the review cap. */
  readonly text: string
  /** Whether the review text was truncated. */
  readonly textTruncated: boolean
  /** Confidence rounded to four decimals. */
  readonly confidence: number
}

/** Human-review guidance derived from block text and confidence. */
export interface OcrReview {
  readonly lowConfidence: readonly OcrReviewItem[]
  readonly amountLike: readonly OcrReviewItem[]
  readonly numericLike: readonly OcrReviewItem[]
  readonly dateLike: readonly OcrReviewItem[]
  readonly quantityLike: readonly OcrReviewItem[]
  readonly needsReview: boolean
}

/** Heuristic Markdown table reconstruction from OCR block geometry. */
export interface OcrTable {
  readonly markdown: string
  readonly rowCount: number
  readonly maxColumns: number
  readonly note: string
}

/** A recognition request. */
export interface OcrRecognizeRequest {
  /** Absolute path to the local image file. */
  readonly path: string
  /** Whether to include per-block bounding boxes in the result. */
  readonly includeBoxes: boolean
  /** Whether to include the heuristic Markdown table reconstruction. */
  readonly table: boolean
  /** Maximum recognized text characters to return in `text`. */
  readonly maxTextChars: number
}

/** The recognition result. */
export interface OcrRecognizeResult {
  readonly text: string
  readonly blocks: readonly OcrBlock[]
  readonly engine: string
  readonly runtime: string
  readonly ocrVersion: string
  readonly modelType: string
  readonly elapsedMs: number
  readonly orientationDegrees: number
  readonly truncated: boolean
  readonly review: OcrReview
  readonly table?: OcrTable
}

/** Engine readiness snapshot. */
export interface OcrStatus {
  readonly installed: boolean
  readonly ready: boolean
  readonly modelsReady: boolean
  readonly loaded: boolean
  readonly missingModels: readonly string[]
  readonly ownerId: string
  readonly engine: string
  readonly runtime: string
  readonly version: string
  readonly ocrVersion: string
  readonly modelType: string
  readonly error?: string
}
