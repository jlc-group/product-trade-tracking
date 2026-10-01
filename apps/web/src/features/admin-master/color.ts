// Color helpers for master-data records (store / shelf type colors are data, not theme tokens).

/** Preset swatches offered in the color picker — picked to read well behind white text. */
export const COLOR_PRESETS = [
  '#16a34a',
  '#65a30d',
  '#0d9488',
  '#0891b2',
  '#2563eb',
  '#1e3a8a',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#dc2626',
  '#ee4d2d',
  '#ea580c',
  '#d97706',
  '#475569',
  '#18181b',
] as const

/** Neutral used when a half-typed hex can't be rendered yet. */
export const FALLBACK_COLOR = '#64748b'

export const HEX_RE = /^#[0-9a-f]{6}$/i

export function isHexColor(value: string) {
  return HEX_RE.test(value)
}

export function safeColor(value: string | null | undefined, fallback: string = FALLBACK_COLOR) {
  return value && isHexColor(value) ? value : fallback
}

/** "2563EB" / "#2563eb " → "#2563eb"; leaves partial input alone apart from the leading '#'. */
export function normalizeHexInput(raw: string) {
  const v = raw.trim().replace(/[^#0-9a-f]/gi, '')
  const body = v.replace(/#/g, '').slice(0, 6)
  return `#${body}`.toLowerCase()
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string) {
  const c = safeColor(hex).slice(1)
  const channel = (i: number) => {
    const s = parseInt(c.slice(i, i + 2), 16) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** True when white text on this color falls below a 3:1 contrast ratio. */
export function isTooLightForWhiteText(hex: string) {
  if (!isHexColor(hex)) return false
  return 1.05 / (luminance(hex) + 0.05) < 3
}

/** 8-digit hex with alpha, e.g. tint('#2563eb', 0.1) → '#2563eb1a'. */
export function tint(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${safeColor(hex)}${a}`
}
