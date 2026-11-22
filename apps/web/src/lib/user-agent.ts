/**
 * A short, human label for a browser user-agent string ("Chrome · Android"), good enough to
 * recognise one's own devices. Unknown parts fall back to null; nothing is sent anywhere.
 */
export interface DeviceLabel {
  browser: string | null
  os: string | null
  mobile: boolean
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows NT/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

export function describeUserAgent(userAgent: string): DeviceLabel {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
  return { browser, os, mobile: /Mobi|Android|iPhone|iPad/.test(userAgent) }
}
