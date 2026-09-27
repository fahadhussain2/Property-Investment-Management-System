// Applies the saved (or device) theme before first paint, so dark mode does not flash white.
// A file, not an inline script, because the CSP is script-src 'self'. Mirrors src/lib/theme.ts.
;(function () {
  var stored = null
  try {
    stored = localStorage.getItem('theme')
  } catch {
    // Storage blocked: fall back to the device setting.
  }
  var dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
})()
