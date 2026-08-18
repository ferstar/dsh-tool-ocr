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
  { value: 'chinese', label: 'Chinese（简体中文）' },
  { value: 'chinese_cht', label: 'Chinese (Traditional)（繁體中文）' },
  { value: 'english', label: 'English' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'afrikaans', label: 'Afrikaans' },
  { value: 'azerbaijani', label: 'Azerbaijani' },
  { value: 'bosnian', label: 'Bosnian' },
  { value: 'catalan', label: 'Catalan' },
  { value: 'czech', label: 'Czech' },
  { value: 'welsh', label: 'Welsh' },
  { value: 'danish', label: 'Danish' },
  { value: 'german', label: 'German' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'estonian', label: 'Estonian' },
  { value: 'basque', label: 'Basque' },
  { value: 'finnish', label: 'Finnish' },
  { value: 'french', label: 'French' },
  { value: 'irish', label: 'Irish' },
  { value: 'galician', label: 'Galician' },
  { value: 'croatian', label: 'Croatian' },
  { value: 'hungarian', label: 'Hungarian' },
  { value: 'indonesian', label: 'Indonesian' },
  { value: 'icelandic', label: 'Icelandic' },
  { value: 'italian', label: 'Italian' },
  { value: 'kurdish', label: 'Kurdish' },
  { value: 'latin', label: 'Latin' },
  { value: 'luxembourgish', label: 'Luxembourgish' },
  { value: 'lithuanian', label: 'Lithuanian' },
  { value: 'latvian', label: 'Latvian' },
  { value: 'maori', label: 'Maori' },
  { value: 'malay', label: 'Malay' },
  { value: 'maltese', label: 'Maltese' },
  { value: 'dutch', label: 'Dutch' },
  { value: 'norwegian', label: 'Norwegian' },
  { value: 'occitan', label: 'Occitan' },
  { value: 'polish', label: 'Polish' },
  { value: 'portuguese', label: 'Portuguese' },
  { value: 'quechua', label: 'Quechua' },
  { value: 'romansh', label: 'Romansh' },
  { value: 'romanian', label: 'Romanian' },
  { value: 'serbian_latin', label: 'Serbian Latin' },
  { value: 'slovak', label: 'Slovak' },
  { value: 'slovenian', label: 'Slovenian' },
  { value: 'albanian', label: 'Albanian' },
  { value: 'swedish', label: 'Swedish' },
  { value: 'swahili', label: 'Swahili' },
  { value: 'tagalog', label: 'Tagalog' },
  { value: 'turkish', label: 'Turkish' },
  { value: 'uzbek', label: 'Uzbek' },
  { value: 'vietnamese', label: 'Vietnamese' },
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
