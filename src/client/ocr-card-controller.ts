/**
 * The ocr plugin's configuration card controller: a staged form over the
 * `tool-ocr` settings namespace. The namespace is the join key — the Host
 * serves it, the browser card claims it, and the configurable-plugins tab
 * pairs the two without ever learning what the namespace means.
 */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
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
  /** Dropdown choices for fields the engine vocabulary constrains; absent keeps a text input. */
  options?: readonly { value: string; label: string }[]
}

/** Recognition languages the newbee-ocr CLI accepts (canonical aliases). */
export const LANGUAGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'chinese', label: 'chinese（简体中文）' },
  { value: 'chinese_cht', label: 'chinese_cht（繁體中文）' },
  { value: 'english', label: 'english' },
  { value: 'japanese', label: 'japanese' },
  { value: 'afrikaans', label: 'afrikaans' },
  { value: 'azerbaijani', label: 'azerbaijani' },
  { value: 'bosnian', label: 'bosnian' },
  { value: 'catalan', label: 'catalan' },
  { value: 'czech', label: 'czech' },
  { value: 'welsh', label: 'welsh' },
  { value: 'danish', label: 'danish' },
  { value: 'german', label: 'german' },
  { value: 'spanish', label: 'spanish' },
  { value: 'estonian', label: 'estonian' },
  { value: 'basque', label: 'basque' },
  { value: 'finnish', label: 'finnish' },
  { value: 'french', label: 'french' },
  { value: 'irish', label: 'irish' },
  { value: 'galician', label: 'galician' },
  { value: 'croatian', label: 'croatian' },
  { value: 'hungarian', label: 'hungarian' },
  { value: 'indonesian', label: 'indonesian' },
  { value: 'icelandic', label: 'icelandic' },
  { value: 'italian', label: 'italian' },
  { value: 'kurdish', label: 'kurdish' },
  { value: 'latin', label: 'latin' },
  { value: 'luxembourgish', label: 'luxembourgish' },
  { value: 'lithuanian', label: 'lithuanian' },
  { value: 'latvian', label: 'latvian' },
  { value: 'maori', label: 'maori' },
  { value: 'malay', label: 'malay' },
  { value: 'maltese', label: 'maltese' },
  { value: 'dutch', label: 'dutch' },
  { value: 'norwegian', label: 'norwegian' },
  { value: 'occitan', label: 'occitan' },
  { value: 'polish', label: 'polish' },
  { value: 'portuguese', label: 'portuguese' },
  { value: 'quechua', label: 'quechua' },
  { value: 'romansh', label: 'romansh' },
  { value: 'romanian', label: 'romanian' },
  { value: 'serbian_latin', label: 'serbian_latin' },
  { value: 'slovak', label: 'slovak' },
  { value: 'slovenian', label: 'slovenian' },
  { value: 'albanian', label: 'albanian' },
  { value: 'swedish', label: 'swedish' },
  { value: 'swahili', label: 'swahili' },
  { value: 'tagalog', label: 'tagalog' },
  { value: 'turkish', label: 'turkish' },
  { value: 'uzbek', label: 'uzbek' },
  { value: 'vietnamese', label: 'vietnamese' },
]

/** Detection model tiers the newbee-ocr CLI accepts. */
export const DET_MODEL_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'v6-tiny', label: 'v6-tiny' },
  { value: 'v6-small', label: 'v6-small' },
  { value: 'v6-medium', label: 'v6-medium' },
  { value: 'v5', label: 'v5' },
  { value: 'v5-fp16', label: 'v5-fp16' },
  { value: 'v4', label: 'v4' },
]

/** The fields this card edits, in render order. */
export const OCR_FIELDS: readonly OcrFieldEntry[] = [
  { key: 'command', spec: textField('command'), numeric: false },
  { key: 'language', spec: textField('language'), numeric: false, options: LANGUAGE_OPTIONS },
  { key: 'detModel', spec: textField('detModel'), numeric: false, options: DET_MODEL_OPTIONS },
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
  /**
   * Open the host's native directory chooser and stage the picked path as
   * the models-dir draft. A cancellation or refusal stages nothing.
   */
  pickDirectory(): Promise<void>
}

/** Bridges the `tool-ocr` settings scope onto the card. */
export class OcrCardController {
  private readonly form: OcrForm<OcrCardSettings>
  private readonly store: SnapshotStore<OcrCardState>

  /**
   * @param scope - the bound settings scope for the `tool-ocr` namespace.
   * @param api - wire face used for the native directory chooser; absent
   *   deployments (no connection seam) render no picking affordance.
   */
  constructor(
    scope: SettingsScope<OcrCardSettings>,
    private readonly api: Pick<IApiClient, 'host'> | undefined,
  ) {
    this.form = new OcrForm(
      scope,
      OCR_FIELDS.map(field => field.spec),
    )
    this.store = this.form.bind(() => ({
      ...this.form.shell(),
      fields: Object.fromEntries(OCR_FIELDS.map(field => [field.key, this.form.field(field.key)])),
    }))
  }

  /**
   * Open the host's native directory chooser and stage the picked path.
   * @returns settlement after the dialog; a cancellation or refusal stages nothing.
   */
  async pickDirectory(): Promise<void> {
    if (this.api === undefined) return
    const response = await this.api.host.pickDirectory({}, new AbortController().signal)
    if (!response.result.ok) return
    const path = response.result.value.path
    if (path !== null) this.form.actions().edit('modelsDir', path)
  }

  /** Build the face the card's slot registration injects. */
  inject(): OcrCardFace {
    return { hooks: { ocrCard: this.store }, ...this.form.actions(), pickDirectory: () => this.pickDirectory() }
  }
}
