/**
 * Pure formatting for the `ocr` tool: recognition text rendering, review guidance rendering, and
 * status formatting. No I/O — presenters run on live streaming and replay.
 * @module dsh-ocr/render
 */


/** The actions the tool exposes. */
export const OCR_ACTIONS: readonly string[] = ['recognize', 'status', 'install', 'check']

/** Default maximum recognized text characters returned in `text`. */
export const DEFAULT_MAX_TEXT_CHARS = 12_000

/** Default per-call timeout budget in ms. */
export const DEFAULT_OCR_TIMEOUT_MS = 600_000

/** The stable system-prompt guidance positioning OCR as the vision substitute. */
export const OCR_PROMPT_TEXT =
  'Use ocr to extract text from local images and screenshots before answering text-only questions about their contents. ' +
  'Prefer path for files; use attachment_id for images already attached to the conversation.'

/** The recognition fields the renderer reads. */
export interface OcrRenderRecognizeResult {
  readonly text: string
  readonly truncated: boolean
  readonly engine: string
  readonly runtime: string
  readonly ocrVersion: string
  readonly modelType: string
  readonly elapsedMs: number
  readonly review: {
    readonly needsReview: boolean
    readonly lowConfidence: readonly { readonly text: string }[]
    readonly amountLike: readonly { readonly text: string }[]
    readonly numericLike: readonly { readonly text: string }[]
    readonly dateLike: readonly { readonly text: string }[]
    readonly quantityLike: readonly { readonly text: string }[]
  }
  readonly table?: { readonly markdown: string }
}

/** The status fields the renderer reads. */
export interface OcrRenderStatus {
  readonly installed: boolean
  readonly ready: boolean
  readonly modelsReady: boolean
  readonly loaded: boolean
  readonly missingModels: readonly string[]
  readonly engine: string
  readonly runtime: string
  readonly version: string
  readonly ocrVersion: string
  readonly modelType: string
  readonly error?: string
}

/** Format the recognition text for the model. */
export function formatRecognitionText(result: OcrRenderRecognizeResult): string {
  const sections: string[] = []
  if (result.text.length > 0) {
    sections.push(`<text>
${result.text}
</text>`)
  } else {
    sections.push('<text>(no text detected)</text>')
  }
  if (result.truncated) {
    sections.push(`<truncated>true</truncated>`)
  }
  sections.push(`<engine>${result.engine}/${result.runtime} ${result.ocrVersion} ${result.modelType}</engine>`)
  sections.push(`<elapsedMs>${result.elapsedMs}</elapsedMs>`)
  if (result.review.needsReview) {
    const reviewLines: string[] = ['<review>']
    if (result.review.lowConfidence.length > 0) {
      reviewLines.push(`  <lowConfidence>${result.review.lowConfidence.map(item => item.text).join(' | ')}</lowConfidence>`)
    }
    if (result.review.amountLike.length > 0) {
      reviewLines.push(`  <amountLike>${result.review.amountLike.map(item => item.text).join(' | ')}</amountLike>`)
    }
    if (result.review.numericLike.length > 0) {
      reviewLines.push(`  <numericLike>${result.review.numericLike.map(item => item.text).join(' | ')}</numericLike>`)
    }
    if (result.review.dateLike.length > 0) {
      reviewLines.push(`  <dateLike>${result.review.dateLike.map(item => item.text).join(' | ')}</dateLike>`)
    }
    if (result.review.quantityLike.length > 0) {
      reviewLines.push(`  <quantityLike>${result.review.quantityLike.map(item => item.text).join(' | ')}</quantityLike>`)
    }
    reviewLines.push('  <needsReview>true — verify flagged text before relying on it</needsReview>')
    reviewLines.push('</review>')
    sections.push(reviewLines.join('\n'))
  }
  if (result.table !== undefined) {
    sections.push(`<table>
${result.table.markdown}
</table>`)
    sections.push('<tableNote>Heuristic reconstruction from OCR boxes; verify structure.</tableNote>')
  }
  return sections.join('\n\n')
}

/** Format the engine status for the model. */
export function formatStatusText(status: OcrRenderStatus): string {
  const lines = [
    `<installed>${status.installed}</installed>`,
    `<ready>${status.ready}</ready>`,
    `<modelsReady>${status.modelsReady}</modelsReady>`,
    `<loaded>${status.loaded}</loaded>`,
    `<engine>${status.engine} ${status.version} ${status.runtime}</engine>`,
    `<ocrVersion>${status.ocrVersion}</ocrVersion>`,
    `<modelType>${status.modelType}</modelType>`,
  ]
  if (status.missingModels.length > 0) {
    lines.push(`<missingModels>${status.missingModels.join(', ')}</missingModels>`)
  }
  if (status.error !== undefined) {
    lines.push(`<error>${status.error}</error>`)
  }
  return lines.join('\n')
}