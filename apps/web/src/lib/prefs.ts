// Per-browser display preferences (not shared, not critical).
import { useSyncExternalStore } from 'react'

export interface Prefs {
  buddhistEra: boolean
  sidebarCollapsed: boolean
}

const KEY = 'flowtrade.prefs'
const defaults: Prefs = { buddhistEra: true, sidebarCollapsed: false }

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

let state = read()
const listeners = new Set<() => void>()

export const usePrefsStore = {
  get: () => state,
  set(patch: Partial<Prefs>) {
    state = { ...state, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function usePrefs() {
  return useSyncExternalStore(usePrefsStore.subscribe, usePrefsStore.get)
}
