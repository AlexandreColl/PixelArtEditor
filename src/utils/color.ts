export const TRANSPARENT = 'rgba(0,0,0,0)'

/** [r, g, b, a] with every channel in 0–255 */
export type RGBA = [number, number, number, number]

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() and "transparent". */
export function parseColor(color: unknown): RGBA | null {
  if (typeof color !== 'string') return null
  const s = color.trim().toLowerCase()
  if (s === 'transparent') return [0, 0, 0, 0]

  const hex = s.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16)
    return [v(0), v(2), v(4), h.length === 8 ? v(6) : 255]
  }

  const fn = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (fn) {
    const c = (n: string) => Math.min(255, Number(n))
    const a = fn[4] === undefined ? 255 : Math.round(Math.min(1, Number(fn[4])) * 255)
    return [c(fn[1]), c(fn[2]), c(fn[3]), a]
  }
  return null
}

export function toHex([r, g, b]: RGBA): string {
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
}

/** Canonical pixel format: TRANSPARENT, #rrggbb when opaque, rgba() otherwise. */
export function formatColor(rgba: RGBA): string {
  const a = rgba[3]
  if (a === 0) return TRANSPARENT
  if (a === 255) return toHex(rgba)
  return `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${+(a / 255).toFixed(3)})`
}

export function normalizeColor(color: unknown): string | null {
  const c = parseColor(color)
  return c ? formatColor(c) : null
}

/** [hue 0–360, saturation 0–1, value 0–1] */
export type HSV = [number, number, number]

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max / 255]
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return [f(5), f(3), f(1)]
}

/** A hex color typed by hand (#rgb or #rrggbb, the # optional) as #rrggbb, or null if it is not one. */
export function parseHexInput(text: string): string | null {
  const hex = text.trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null
  return normalizeColor(`#${hex}`)
}
