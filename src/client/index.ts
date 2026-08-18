/**
 * The ocr plugin's browser half: one configuration card inside the
 * configurable-plugins tab, keyed by the `tool-ocr` settings namespace the
 * Host half registers. The module system serves this entry as soon as a
 * cordis.yml mounts the plugin — no rebuild of the web application.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the keyed slot's declaration (settings.plugin.item).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { OcrCard } from './OcrCard.tsx'
import { OcrCardController, TOOL_OCR_NS, type OcrCardSettings } from './ocr-card-controller.ts'
import { en, zh, type OcrCardKey } from './locales.ts'

export { OcrCard } from './OcrCard.tsx'
export { OcrCardController, OCR_FIELDS, TOOL_OCR_NS } from './ocr-card-controller.ts'
export type { OcrCardFace, OcrCardSettings, OcrCardState } from './ocr-card-controller.ts'
export { OcrForm, numberField, textField } from './ocr-form.ts'
export type { OcrFieldSpec, OcrFieldState, OcrFormActions, OcrFormShell } from './ocr-form.ts'
export type { OcrCardKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ocr configuration card's copy. */
    'settings.toolOcr': OcrCardKey
  }
}

/** Dictionary namespace owned by this plugin's card. */
const CARD_LOCALE_NS = 'settings.toolOcr'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Mount the ocr configuration card.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(CARD_LOCALE_NS, { zh, en }), 'dsh-tool-ocr: card dictionaries')
  const card = new OcrCardController(ctx.settingsScope.bind<OcrCardSettings>({ namespace: TOOL_OCR_NS }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: TOOL_OCR_NS,
    locale: CARD_LOCALE_NS,
    inject: () => card.inject(),
  }, OcrCard))
}
