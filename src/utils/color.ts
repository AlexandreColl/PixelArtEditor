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
