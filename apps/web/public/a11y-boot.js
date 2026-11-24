/* global window, document */
/*
 * Applies the saved accessibility settings (text size, theme, spacing, readable letters,
 * underlined links, less motion) before the app starts, so a dark or high-contrast page
 * never flashes white. A separate file because the Content-Security-Policy allows no
 * inline scripts. Mirrors applyA11y() in src/lib/a11y.ts (a11y.test.ts keeps them in sync).
 */
;(function () {
  var SIZES = [0.9, 1, 1.125, 1.25, 1.4]
  var THEMES = ['light', 'dark', 'contrast', 'system']
  try {
    var raw = window.localStorage.getItem('tb.a11y')
    if (!raw) return
    var s = JSON.parse(raw)
    var root = document.documentElement
    var size = SIZES[s.size]
    if (size && size !== 1) root.style.fontSize = size * 100 + '%'
    var theme = THEMES.indexOf(s.theme) >= 0 ? s.theme : 'light'
    if (theme === 'system') {
      theme =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    }
    root.setAttribute('data-theme', theme)
    if (s.spacing === true) root.setAttribute('data-spacing', 'on')
    if (s.readable === true) root.setAttribute('data-readable', 'on')
    if (s.underline === true) root.setAttribute('data-underline', 'on')
    if (s.reduceMotion === true) root.setAttribute('data-reduce-motion', 'on')
  } catch {
    // Blocked storage or a damaged value: the default look is used.
  }
})()
