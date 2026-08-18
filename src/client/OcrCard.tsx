/**
 * The ocr plugin's configuration card inside the configurable-plugins tab:
 * engine command and model bounds, staged through the card's own form model.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { OCR_FIELDS, type OcrCardFace } from './ocr-card-controller.ts'

/** Props the renderer binds for the ocr card. */
export type OcrCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.toolOcr'>
  & InjectFace<OcrCardFace>

/** Render the ocr card. */
export function OcrCard(props: OcrCardProps) {
  const { t } = props
  const state = props.useOcrCard(snapshot => snapshot)
  if (!state.available) return null
  const disabled = !state.writable
  return (
    <div style={{ border: '1px solid #d0d0d0', borderRadius: 8, padding: 16, margin: '16px 0' }}>
      <h3 style={{ margin: '0 0 4px' }}>{t('title')}</h3>
      <p style={{ margin: '0 0 16px', opacity: 0.7 }}>{t('description')}</p>
      {OCR_FIELDS.map(field => {
        // The projection builds one row per OCR_FIELDS entry, so the key always exists.
        const view = state.fields[field.key]!
        const label = t(field.key)
        const hint = field.key === 'command' ? t('commandHint') : undefined
        return (
          <div key={field.key} style={{ marginBottom: 12 }}>
            <label
              htmlFor={'ocr-field-' + field.key}
              style={{ display: 'block', fontSize: 13, marginBottom: 4 }}
            >
              {label}
              {view.overridden ? <span style={{ marginLeft: 8, opacity: 0.6 }}>{t('overridden')}</span> : null}
            </label>
            {hint === undefined ? null : <p style={{ margin: '0 0 4px', fontSize: 12, opacity: 0.6 }}>{hint}</p>}
            <input
              id={'ocr-field-' + field.key}
              type={field.spec.parse('1') !== undefined && field.key !== 'command' ? 'number' : 'text'}
              style={{ width: '100%', boxSizing: 'border-box', border: view.invalid ? '1px solid #c62828' : '1px solid #d0d0d0', borderRadius: 4, padding: '6px 8px' }}
              value={view.text}
              disabled={disabled}
              onChange={event => { props.edit(field.key, event.target.value) }}
            />
            {view.invalid ? <p style={{ margin: '2px 0 0', fontSize: 12, color: '#c62828' }}>{t('invalidNumber')}</p> : null}
          </div>
        )
      })}
      {state.failed ? <p style={{ color: '#c62828', margin: '0 0 8px' }}>{t('saveFailed')}</p> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={disabled || !state.dirty || state.saving || state.invalid} onClick={props.save}>
          {t('save')}
        </button>
        <button disabled={disabled || (!state.dirty && !state.failed)} onClick={props.discard}>
          {t('discard')}
        </button>
      </div>
    </div>
  )
}
