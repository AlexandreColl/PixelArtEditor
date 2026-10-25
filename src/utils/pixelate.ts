import type { PixelData } from '../types'
import { TRANSPARENT, formatColor } from './color'

type RGB = [number, number, number]

/** An image reduced to the target size: straight (not premultiplied) RGBA, channels 0–255. */
export interface Downscaled {
  width: number
  height: number
  data: Float32Array
}

export interface PixelateOptions {
  /** Number of colors in the generated palette */
  colors: number
  /** Floyd–Steinberg error diffusion */
  dither: boolean
  /** Pixels whose averaged alpha is below this (0–255) become transparent; the rest become opaque */
  alphaThreshold: number
}

/** Output size keeping the aspect ratio, with the long side equal to `longSide` (never upscales). */
export function fitSize(width: number, height: number, longSide: number): { width: number; height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Box-filter downscale: every output pixel is the average of the source block it covers.
 * Colors are averaged weighted by alpha so transparent pixels don't darken edges.
 */
export function downscale(source: ImageData, width: number, height: number): Downscaled {
  const { data: src, width: sw, height: sh } = source
  const out = new Float32Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * sh) / height)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / height))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * sw) / width)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / width))
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = y0; sy < y1; sy++) {
        let i = (sy * sw + x0) * 4
        for (let sx = x0; sx < x1; sx++, i += 4) {
          const pa = src[i + 3]
          r += src[i] * pa
          g += src[i + 1] * pa
          b += src[i + 2] * pa
          a += pa
        }
      }
      const o = (y * width + x) * 4
      const count = (y1 - y0) * (x1 - x0)
      if (a > 0) {
        out[o] = r / a
        out[o + 1] = g / a
        out[o + 2] = b / a
      }
      out[o + 3] = a / count
    }
  }
  return { width, height, data: out }
}

/** Median cut: repeatedly splits the box with the widest channel range at its median. */
export function buildPalette(colors: RGB[], size: number): RGB[] {
  if (colors.length === 0) return []
  const boxes: RGB[][] = [colors]
  while (boxes.length < size) {
    let best = -1
    let bestRange = 0
    let bestChannel = 0
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      for (let ch = 0; ch < 3; ch++) {
        let min = 255
        let max = 0
        for (const c of box) {
          if (c[ch] < min) min = c[ch]
          if (c[ch] > max) max = c[ch]
        }
        if (max - min > bestRange) {
          bestRange = max - min
          best = i
          bestChannel = ch
        }
      }
    })
    // Every box holds a single color: the image has fewer colors than requested
    if (best < 0) break
    const box = boxes[best].sort((p, q) => p[bestChannel] - q[bestChannel])
    const mid = box.length >> 1
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid))
  }
  return boxes.map(box => {
    const sum = box.reduce<RGB>((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0])
    return [Math.round(sum[0] / box.length), Math.round(sum[1] / box.length), Math.round(sum[2] / box.length)]
  })
}

/** Weighted RGB distance, a cheap approximation of how different colors look. */
function nearest(palette: RGB[], r: number, g: number, b: number): RGB {
  let best = palette[0]
  let bestDist = Infinity
  for (const c of palette) {
    const dr = c[0] - r
    const dg = c[1] - g
    const db = c[2] - b
    const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return best
}

/** Reduces a downscaled image to a limited palette and returns it as editor pixels. */
export function quantize(image: Downscaled, options: PixelateOptions): PixelData {
  const { width, height } = image
  const work = Float32Array.from(image.data)
  const opaque = (i: number) => image.data[i + 3] >= options.alphaThreshold

  const samples: RGB[] = []
  for (let i = 0; i < work.length; i += 4) {
    if (opaque(i)) samples.push([work[i], work[i + 1], work[i + 2]])
  }
  const palette = buildPalette(samples, Math.max(1, options.colors))

  const pixels: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (!opaque(i) || palette.length === 0) {
        row.push(TRANSPARENT)
        continue
      }
      const r = Math.min(255, Math.max(0, work[i]))
      const g = Math.min(255, Math.max(0, work[i + 1]))
      const b = Math.min(255, Math.max(0, work[i + 2]))
      const c = nearest(palette, r, g, b)
      row.push(formatColor([c[0], c[1], c[2], 255]))

      if (options.dither) {
        const er = r - c[0]
        const eg = g - c[1]
        const eb = b - c[2]
        // Floyd–Steinberg weights; error only spreads to opaque neighbours
        const spread = (dx: number, dy: number, w: number) => {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny >= height) return
          const j = (ny * width + nx) * 4
          if (!opaque(j)) return
          work[j] += er * w
          work[j + 1] += eg * w
          work[j + 2] += eb * w
        }
        spread(1, 0, 7 / 16)
        spread(-1, 1, 3 / 16)
        spread(0, 1, 5 / 16)
        spread(1, 1, 1 / 16)
      }
    }
    pixels.push(row)
  }
  return { width, height, pixels }
}

/** Number of distinct colors in an image, stopping early once it exceeds `limit`. */
export function countColors(source: ImageData, limit: number): number {
  const seen = new Set<number>()
  const d = source.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    seen.add(a === 0 ? -1 : ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | a) >>> 0)
    if (seen.size > limit) break
  }
  return seen.size
}
