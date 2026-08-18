/**
 * The ocr plugin's configuration card controller: a staged form over the
 * `tool-ocr` settings namespace. The namespace is the join key — the Host
 * serves it, the browser card claims it, and the configurable-plugins tab
 * pairs the two without ever learning what the namespace means.
 */

import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  numberField, textField, type OcrFieldSpec, type OcrFormActions, type OcrFormShell,
  type OcrFieldState, OcrForm,
} from './ocr-form.ts'

/** The settings namespace the Host registers for the ocr plugin. */
export const TOOL_OCR_NS = 'tool-ocr'

/** The section fields this card edits. */
export interface OcrCardSettings {
  /** The nbocr executable: absolute path or PATH-resolved name. */
  command?: string
  /** Recognition model/language alias. Default `chinese`. */
  language?: string
  /** Detection model tier. Default `v6-tiny`. */
  detModel?: string
  /** Model directory for non-embedded models; empty uses embedded models. */
  modelsDir?: string
  /** Largest recognized text returned in `text`. Default 12000. */
  maxTextChars?: number
  /** Tool-call timeout budget in ms. Default 600000. */
  timeoutMs?: number
  /** Largest accepted image in bytes. Default 25 MiB. */
  maxImageBytes?: number
  /** Largest collected engine stdout in bytes. Default 2 MiB. */
  maxOutputBytes?: number
}

/** One editable field: its section key, its conversion spec, and its control kind. */
export interface OcrFieldEntry {
  /** Field name inside the namespace section. */
  key: keyof OcrCardSettings
  /** Conversion between the stored value and the draft text. */
  spec: OcrFieldSpec
  /** Whether the control hints a numeric keypad. */
  numeric: boolean
}

/** The fields this card edits, in render order. */
export const OCR_FIELDS: readonly OcrFieldEntry[] = [
  { key: 'command', spec: textField('command'), numeric: false },
  { key: 'language', spec: textField('language'), numeric: false },
  { key: 'detModel', spec: textField('detModel'), numeric: false },
  { key: 'modelsDir', spec: textField('modelsDir'), numeric: false },
  { key: 'maxTextChars', spec: numberField('maxTextChars'), numeric: true },
  { key: 'timeoutMs', spec: numberField('timeoutMs'), numeric: true },
  { key: 'maxImageBytes', spec: numberField('maxImageBytes'), numeric: true },
  { key: 'maxOutputBytes', spec: numberField('maxOutputBytes'), numeric: true },
]

/** The card's snapshot: the form shell plus one row per field. */
export interface OcrCardState extends OcrFormShell {
  /** Per-field control state, keyed by field name. */
  fields: Record<string, OcrFieldState>
}

/** The registration-side face the card's slot entry injects. */
export interface OcrCardFace extends OcrFormActions {
  hooks: {
    /** Card snapshot bound by the renderer as useOcrCard. */
    ocrCard: SnapshotStore<OcrCardState>
  }
}

/** Bridges the `tool-ocr` settings scope onto the card. */
export class OcrCardController {
  private readonly form: OcrForm<OcrCardSettings>
  private readonly store: SnapshotStore<OcrCardState>

  /**
   * @param scope - the bound settings scope for the `tool-ocr` namespace.
   */
  constructor(scope: SettingsScope<OcrCardSettings>) {
    this.form = new OcrForm(
      scope,
      OCR_FIELDS.map(field => field.spec),
    )
    this.store = this.form.bind(() => ({
      ...this.form.shell(),
      fields: Object.fromEntries(OCR_FIELDS.map(field => [field.key, this.form.field(field.key)])),
    }))
  }

  /** Build the face the card's slot registration injects. */
  inject(): OcrCardFace {
    return { hooks: { ocrCard: this.store }, ...this.form.actions() }
  }
}
