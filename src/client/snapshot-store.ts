/**
 * Minimal {@link SnapshotStore} implementation for the card's own snapshot.
 * The shared engine lives behind the runtime's module-loader artifact, which
 * a published consumer's tests cannot import; the slot machinery only reads
 * the observable contract, so this card-owned store satisfies it directly.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Create a card-owned snapshot store.
 * @param init - initial state.
 * @returns the store.
 */
export function createCardStore<T>(init: T): SnapshotStore<T> {
  let snapshot = init
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    set: (next) => {
      snapshot = next
      for (const listener of listeners) listener()
    },
    // Nothing in the card calls update; the draft replaces the snapshot so a
    // future caller cannot observe a half-mutated state.
    update: (mutator) => {
      const next = (typeof snapshot === 'object' && snapshot !== null
        ? { ...(snapshot as Record<string, unknown>) }
        : snapshot) as T
      mutator(next)
      snapshot = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
