import { afterEach, describe, expect, it } from 'vitest'
import { getTheme, resolveTheme, setTheme, THEME_KEY } from './theme'

describe('resolveTheme', () => {
  it('prefers the saved choice over the device', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('follows the device when nothing valid is saved', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
    expect(resolveTheme('purple', true)).toBe('dark')
  })
})

describe('setTheme', () => {
  afterEach(() => setTheme('light'))

  it('toggles the dark class and remembers the choice', () => {
    setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(getTheme()).toBe('dark')

    setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })
})
