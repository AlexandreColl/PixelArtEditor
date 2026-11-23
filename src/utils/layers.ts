import type { Layer, PixelData } from '../types'
import { type RGBA, TRANSPARENT, formatColor, parseColor, parseColorCached } from './color'

/** `top` drawn over `bottom` at the given opacity (source-over, like the canvas does). */
export function blendOver(bottom: RGBA, top: RGBA, opacity = 1): RGBA {
  const ta = (top[3] / 255) * opacity
  if (ta <= 0) return bottom
  const ba = bottom[3] / 255
  const a = ta + ba * (1 - ta)
  const mix = (t: number, b: number) => Math.round((t * ta + b * ba * (1 - ta)) / a)
  return [mix(top[0], bottom[0]), mix(top[1], bottom[1]), mix(top[2], bottom[2]), Math.round(a * 255)]
}

/** The layers that show, bottom first, paired with the cel each one has in the frame. */
export function visibleCels(cels: PixelData[], layers: Layer[]): { cel: PixelData; opacity: number }[] {
  return layers.flatMap((layer, i) =>
    layer.visible && layer.opacity > 0 && cels[i] ? [{ cel: cels[i], opacity: layer.opacity }] : [],
  )
}

const TRANSPARENT_RGBA: RGBA = [0, 0, 0, 0]

/** The color shown at (x, y) of a frame: every visible layer blended, or TRANSPARENT. */
export function flattenPixel(cels: PixelData[], layers: Layer[], x: number, y: number): string {
  let out = TRANSPARENT_RGBA
  for (const { cel, opacity } of visibleCels(cels, layers)) {
    out = blendOver(out, parseColor(cel.pixels[y]?.[x]) ?? TRANSPARENT_RGBA, opacity)
  }
  return out[3] === 0 ? TRANSPARENT : formatColor(out)
}

/** The last blend of each bottom row, with the rows above it and their opacities. */
const blendedRows = new WeakMap<string[], { rows: string[][]; opacities: number[]; out: string[] }>()
const formatted = new Map<number, string>()

/** One row of the frame: the layers' rows blended bottom to top. */
function blendRow(rows: string[][], shown: { opacity: number }[], width: number): string[] {
  const out: string[] = []
  for (let x = 0; x < width; x++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let i = 0; i < rows.length; i++) {
      const top = parseColorCached(rows[i][x])
      const ta = (top[3] / 255) * shown[i].opacity
      if (ta <= 0) continue
      // Source-over, as blendOver does, without an array for every step
      const na = ta + a * (1 - ta)
      r = (top[0] * ta + r * a * (1 - ta)) / na
      g = (top[1] * ta + g * a * (1 - ta)) / na
      b = (top[2] * ta + b * a * (1 - ta)) / na
      a = na
      // blendOver rounds after every layer; doing the same keeps the colors identical
      r = Math.round(r)
      g = Math.round(g)
      b = Math.round(b)
      a = Math.round(a * 255) / 255
    }
    const a8 = Math.round(a * 255)
    if (a8 === 0) {
      out.push(TRANSPARENT)
      continue
    }
    const key = ((r * 256 + g) * 256 + b) * 256 + a8
    let color = formatted.get(key)
    if (!color) {
      if (formatted.size >= 65536) formatted.clear()
      color = formatColor([r, g, b, a8])
      formatted.set(key, color)
    }
    out.push(color)
  }
  return out
}

/** The frame as it is shown: every visible layer blended into one image. */
export function flattenFrame(cels: PixelData[], layers: Layer[]): PixelData {
  const shown = visibleCels(cels, layers)
  const { width, height } = cels[0]
  // A single opaque layer is already the image; returning it keeps it the same object
  if (shown.length === 1 && shown[0].opacity === 1) return shown[0].cel
  if (shown.length === 0) {
    return { width, height, pixels: Array.from({ length: height }, () => Array(width).fill(TRANSPARENT)) }
  }
  const pixels: string[][] = []
  for (let y = 0; y < height; y++) {
    const rows = shown.map(({ cel }) => cel.pixels[y])
    // Rows are never changed in place: if every layer's row is the one blended last time, so is the result
    const hit = blendedRows.get(rows[0])
    if (
      hit &&
      hit.rows.length === rows.length &&
      hit.rows.every((r, i) => r === rows[i] && hit.opacities[i] === shown[i].opacity)
    ) {
      pixels.push(hit.out)
      continue
    }
    const out = blendRow(rows, shown, width)
    blendedRows.set(rows[0], { rows, opacities: shown.map(s => s.opacity), out })
    pixels.push(out)
  }
  return { width, height, pixels }
}

const flattenCache = new WeakMap<PixelData[], { layers: Layer[]; result: PixelData }>()

/** flattenFrame, remembered for each frame until its cels or the layers change. */
export function flattenFrameCached(cels: PixelData[], layers: Layer[]): PixelData {
  const hit = flattenCache.get(cels)
  if (hit && hit.layers === layers) return hit.result
  const result = flattenFrame(cels, layers)
  flattenCache.set(cels, { layers, result })
  return result
}
