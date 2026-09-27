import { useSyncExternalStore } from 'react'

// Light/dark theme: a `dark` class on <html> switches the CSS tokens in index.css.
// public/theme-init.js applies the same rule before first paint (keep the two in sync).

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'theme'

/** The user's saved choice wins; with none, follow the device setting. */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored
  return prefersDark ? 'dark' : 'light'
}

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

let current: Theme = resolveTheme(readStored(), media?.matches ?? false)
const listeners = new Set<() => void>()

function apply(theme: Theme) {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  listeners.forEach((l) => l())
}

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
  apply(theme)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Call once at startup: applies the theme, follows device changes, and prints on white. */
export function initTheme() {
  apply(current)
  media?.addEventListener('change', (e) => {
    if (!readStored()) apply(e.matches ? 'dark' : 'light')
  })
  // Paper is always light; the print stylesheet only fixes the page background.
  window.addEventListener('beforeprint', () => document.documentElement.classList.remove('dark'))
  window.addEventListener('afterprint', () => document.documentElement.classList.toggle('dark', current === 'dark'))
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme)
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
