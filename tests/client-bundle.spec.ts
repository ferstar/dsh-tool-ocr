/**
 * Smoke test for the built client bundle: executes lib/client.js under the
 * module-loader contract (a `window.__ModuleLoader__.load` handoff with the
 * platform-module require table) and asserts the exported surface a browser
 * entry must provide.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** The loader table's answer for the one external the bundle requires. */
const platformModules: Record<string, unknown> = {
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: Symbol('Fragment') },
}

interface LoadedEntry {
  id: string
  exports: Record<string, unknown>
}

let loaded: LoadedEntry | undefined

beforeAll(async () => {
  const code = await readFile(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  const load = (entry: { id: string; factory: (require: (id: string) => unknown) => unknown }): void => {
    const exports = entry.factory(id => {
      const mod = platformModules[id]
      if (mod === undefined) throw new Error('unexpected external ' + id)
      return mod
    })
    loaded = { id: entry.id, exports: exports as Record<string, unknown> }
  }
  const window = { __ModuleLoader__: { load } }
  // The artifact is a bare script referencing window; run it with the stub in scope.
  // eslint-disable-next-line no-new-func
  new Function('window', code)(window)
})

describe('client bundle artifact', () => {
  it('hands the plugin id to the module loader and executes its factory', () => {
    expect(loaded?.id).toBe('dsh-tool-ocr')
    expect(loaded?.exports.apply).toBeTypeOf('function')
    expect(loaded?.exports.inject).toEqual(['slots', 'locale', 'settingsScope'])
    expect(loaded?.exports.TOOL_OCR_NS).toBe('tool-ocr')
  })
})
