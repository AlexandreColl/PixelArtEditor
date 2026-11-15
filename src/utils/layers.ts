import type { Layer, PixelData } from '../types'
import { type RGBA, TRANSPARENT, formatColor, parseColor } from './color'

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

/** Parses with a cache: an image has few distinct colors and many pixels. */
function parser() {
  const cache = new Map<string, RGBA>()
  return (color: string) => {
    let c = cache.get(color)
    if (!c) {
      c = parseColor(color) ?? TRANSPARENT_RGBA
      cache.set(color, c)
    }
    return c
  }
}

/** The color shown at (x, y) of a frame: every visible layer blended, or TRANSPARENT. */
export function flattenPixel(cels: PixelData[], layers: Layer[], x: number, y: number): string {
  let out = TRANSPARENT_RGBA
  for (const { cel, opacity } of visibleCels(cels, layers)) {
    out = blendOver(out, parseColor(cel.pixels[y]?.[x]) ?? TRANSPARENT_RGBA, opacity)
  }
  return out[3] === 0 ? TRANSPARENT : formatColor(out)
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
  const parse = parser()
  const format = new Map<string, string>()
  const pixels: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      let out = TRANSPARENT_RGBA
      for (const { cel, opacity } of shown) out = blendOver(out, parse(cel.pixels[y][x]), opacity)
      if (out[3] === 0) {
        row.push(TRANSPARENT)
        continue
      }
      const key = out.join(',')
      let color = format.get(key)
      if (!color) {
        color = formatColor(out)
        format.set(key, color)
      }
      row.push(color)
    }
    pixels.push(row)
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
