/**
 * The ocr plugin's configuration card inside the configurable-plugins tab:
 * a header naming the plugin and its governed settings, disclosing the
 * controls in place, with the save that writes them.
 *
 * Disclosure is card-local state: which card a user has open is a reading
 * gesture. Staged edits outlive collapsing, so the header marks a card
 * holding unsaved edits. Styles ride the app's --dsw-alias-* design tokens
 * so the card matches the settings surface in both themes.
 */

import { useState, type CSSProperties } from 'react'
import { Button, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { OCR_FIELDS, type OcrCardFace } from './ocr-card-controller.ts'

/** Props the renderer binds for the ocr card. */
export type OcrCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.toolOcr'>
  & InjectFace<OcrCardFace>

const card: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-3)',
}

/** An open card reads as the one being worked on, not merely taller. */
const cardOpen: CSSProperties = {
  ...card,
  background: 'var(--dsw-alias-bg-layer-2)',
  borderColor: 'var(--dsw-alias-label-dimmed)',
}

const header: CSSProperties = {
  width: '100%',
  appearance: 'none',
  border: 0,
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  borderRadius: 12,
}

/** Name over description: the description is what tells two plugins apart. */
const headText: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const name: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--dsw-alias-label-primary)',
}

const description: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-tertiary)',
}

/** Carried on the header so a collapsed card still says it holds edits. */
const pending: CSSProperties = {
  flex: 'none',
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  lineHeight: '17px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
}

const chevron: CSSProperties = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
  transition: 'transform .16s',
}

const body: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  margin: '0 16px',
  paddingBottom: 8,
}

const readOnly: CSSProperties = {
  margin: '12px 0 0',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-tertiary)',
}

const field: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 0',
}

/** One field row; separated from its sibling. */
const fieldRow = (first: boolean): CSSProperties => ({
  ...field,
  ...(first ? {} : { borderTop: '1px solid var(--dsw-alias-border-l2)' }),
})

const fieldHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const label: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-primary)',
}

const badges: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8 }

const badge: CSSProperties = {
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  lineHeight: '17px',
  whiteSpace: 'nowrap',
  fontWeight: 500,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
}

const reset: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'pointer',
}

const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 34,
  padding: '0 12px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-3)',
  font: 'inherit',
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-primary)',
}

const inputInvalid: CSSProperties = { ...input, borderColor: 'var(--dsw-alias-label-error)' }

const hint: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-tertiary)',
}

const invalid: CSSProperties = { ...hint, color: 'var(--dsw-alias-label-error)' }

const footer: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 0 4px',
  borderTop: '1px solid var(--dsw-alias-border-l2)',
}

const failed: CSSProperties = {
  flex: 1,
  minWidth: 0,
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-error)',
}

/**
 * Render one field's label, staged text, override badge, and reset control.
 * Nothing here writes: a control reports what the user typed, and the card's
 * save is the single point where a draft becomes a document mutation.
 */
function FieldRow(props: {
  id: string
  label: string
  hint: string | undefined
  view: { text: string; invalid: boolean; overridden: boolean }
  numeric: boolean
  disabled: boolean
  first: boolean
  overriddenLabel: string
  resetLabel: string
  invalidLabel: string
  onEdit: (text: string) => void
  onReset: () => void
}) {
  return (
    <div style={fieldRow(props.first)}>
      <div style={fieldHead}>
        <label style={label} htmlFor={props.id}>{props.label}</label>
        {props.view.overridden
          ? (
            <span style={badges}>
              <span style={badge}>{props.overriddenLabel}</span>
              <button
                type="button"
                style={reset}
                disabled={props.disabled}
                onClick={props.onReset}
              >
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      <input
        id={props.id}
        style={props.view.invalid ? inputInvalid : input}
        type="text"
        {...props.numeric ? { inputMode: 'numeric' as const } : {}}
        {...props.view.invalid ? { 'aria-invalid': true } : {}}
        value={props.view.text}
        disabled={props.disabled}
        onChange={event => { props.onEdit(event.target.value) }}
      />
      <p style={props.view.invalid ? invalid : hint}>
        {props.view.invalid ? props.invalidLabel : props.hint}
      </p>
    </div>
  )
}

/**
 * Render the ocr card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function OcrCard(props: OcrCardProps) {
  const { t } = props
  const state = props.useOcrCard(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  if (!state.available) return null
  const title = t('title')
  const blocked = !state.dirty || state.invalid || state.saving
  return (
    <div style={open ? cardOpen : card}>
      <button
        type="button"
        style={header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span style={headText}>
          <span style={name}>{title}</span>
          <span style={description}>{t('description')}</span>
        </span>
        {state.dirty ? <span style={pending}>{t('unsaved')}</span> : null}
        <span style={open ? { ...chevron, transform: 'rotate(180deg)' } : chevron}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open
        ? (
          <div style={body}>
            {!state.writable ? <p style={readOnly} role="status">{t('readOnly')}</p> : null}
            {OCR_FIELDS.map((field, index) => (
              <FieldRow
                key={field.key}
                id={'ocr-field-' + field.key}
                label={t(field.key)}
                hint={field.key === 'command' ? t('commandHint') : undefined}
                view={state.fields[field.key]!}
                numeric={field.numeric}
                disabled={!state.writable}
                first={index === 0}
                overriddenLabel={t('overridden')}
                resetLabel={t('reset')}
                invalidLabel={t('invalidNumber')}
                onEdit={text => { props.edit(field.key, text) }}
                onReset={() => { props.resetField(field.key) }}
              />
            ))}
            <div style={footer}>
              {state.failed ? <p style={failed} role="status">{t('saveFailed')}</p> : null}
              <Button
                variant="outline"
                size="sm"
                disabled={!state.dirty || state.saving}
                onClick={props.discard}
              >
                {t('discard')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={blocked}
                onClick={props.save}
              >
                {t(state.saving ? 'saving' : 'save')}
              </Button>
            </div>
          </div>
        )
        : null}
    </div>
  )
}
