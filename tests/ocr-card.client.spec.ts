// @vitest-environment jsdom
/**
 * Card controller behavior over a scripted settings scope: staging, save,
 * discard, override presence, and invalid-draft blocking. The scope is a
 * fake because the card owns its own staging; the Host stays the only
 * authority on acceptance, so the fake reports acceptance exactly as the
 * section reads back.
 */

import { describe, expect, it } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { OcrCardController } from '../src/client/ocr-card-controller.ts'

/** A scripted SettingsScope: set/unset mutate a user layer and notify. */
class FakeScope implements SettingsScope<Record<string, unknown>> {
  listeners = new Set<() => void>()
  revision = 0
  private value: Record<string, unknown> = {}
  private user: Record<string, unknown> = {}

  constructor(base: Record<string, unknown>) {
    this.value = { ...base }
  }

  getSnapshot(): SettingsScopeSnapshot<Record<string, unknown>> {
    return {
      status: 'ready',
      value: { ...this.value },
      base: { ...this.value },
      user: { ...this.user },
      revision: this.revision,
      writable: true,
      mode: 'host',
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async set(field: string, v: unknown): Promise<void> {
    this.user[field] = v
    this.value[field] = v
    this.revision += 1
    this.emit()
  }

  async unset(field: string): Promise<void> {
    delete this.user[field]
    delete this.value[field]
    this.revision += 1
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

function mount(initial: Record<string, unknown> = { command: 'nbocr', maxTextChars: 12000 }) {
  const scope = new FakeScope(initial)
  const card = new OcrCardController(scope)
  const face = card.inject()
  const snapshot = () => face.hooks.ocrCard.getSnapshot()
  return { scope, face, snapshot }
}

describe('ocr card controller', () => {
  it('seeds fields from the resolved section and reports overrides from the user layer', () => {
    const { snapshot } = mount({ command: 'nbocr', detModel: 'v6-tiny', maxTextChars: 12000 })
    expect(snapshot().fields.command.text).toBe('nbocr')
    expect(snapshot().fields.detModel.text).toBe('v6-tiny')
    expect(snapshot().fields.maxTextChars.text).toBe('12000')
    expect(snapshot().fields.command.overridden).toBe(false)
  })

  it('stages edits and writes them on save', async () => {
    const { scope, face, snapshot } = mount()
    face.edit('detModel', 'v6-large')
    expect(snapshot().fields.detModel.text).toBe('v6-large')
    expect(snapshot().dirty).toBe(true)
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(scope.getSnapshot().user.detModel).toBe('v6-large')
    expect(snapshot().dirty).toBe(false)
  })

  it('discard drops staged edits', () => {
    const { face, snapshot } = mount()
    face.edit('detModel', 'v6-large')
    expect(snapshot().dirty).toBe(true)
    face.discard()
    expect(snapshot().fields.detModel.text).toBe('')
    expect(snapshot().dirty).toBe(false)
  })

  it('reset stages a clear so the field re-inherits the composition layer', async () => {
    const { scope, face } = mount()
    face.edit('command', 'nbocr2')
    face.resetField('command')
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(scope.getSnapshot().user.command).toBeUndefined()
  })

  it('a non-numeric draft on a number field blocks the save', () => {
    const { face, snapshot } = mount()
    face.edit('maxTextChars', 'twelve')
    expect(snapshot().fields.maxTextChars.invalid).toBe(true)
    expect(snapshot().invalid).toBe(true)
  })
})
