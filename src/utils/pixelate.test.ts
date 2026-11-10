import { describe, expect, it } from 'vitest'
import { buildPalette, countColors, downscale, fitSize, quantize, type Downscaled } from './pixelate'
import { TRANSPARENT } from './color'

/** An ImageData stand-in (Node has no canvas) built from one [r, g, b, a] per pixel, row by row. */
function image(width: number, height: number, pixels: number[][]): ImageData {
  return { width, height, data: Uint8ClampedArray.from(pixels.flat()), colorSpace: 'srgb' } as ImageData
}

function downscaled(width: number, height: number, pixels: number[][]): Downscaled {
  return { width, height, data: Float32Array.from(pixels.flat()) }
}

const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]
const CLEAR = [0, 0, 0, 0]

describe('fitSize', () => {
  it('scales the long side to the target and keeps the aspect ratio', () => {
    expect(fitSize(200, 100, 64)).toEqual({ width: 64, height: 32 })
    expect(fitSize(100, 400, 64)).toEqual({ width: 16, height: 64 })
  })

  it('never upscales', () => {
    expect(fitSize(10, 5, 64)).toEqual({ width: 10, height: 5 })
  })

  it('never returns a zero side', () => {
    expect(fitSize(1000, 1, 16)).toEqual({ width: 16, height: 1 })
  })
})

describe('downscale', () => {
  it('averages each source block', () => {
    const out = downscale(image(2, 1, [RED, BLUE]), 1, 1)
    expect(Array.from(out.data)).toEqual([127.5, 0, 127.5, 255])
  })

  it('weights color by alpha so transparent pixels do not darken edges', () => {
    const out = downscale(image(2, 1, [RED, CLEAR]), 1, 1)
    expect(Array.from(out.data)).toEqual([255, 0, 0, 127.5])
  })

  it('keeps the image unchanged at the same size', () => {
    const out = downscale(image(2, 1, [RED, BLUE]), 2, 1)
    expect(Array.from(out.data)).toEqual([...RED, ...BLUE])
  })
})

describe('buildPalette', () => {
  it('returns no colors for no samples', () => {
    expect(buildPalette([], 8)).toEqual([])
  })

  it('stops early when the image has fewer colors than requested', () => {
    const palette = buildPalette(
      [
        [255, 0, 0],
        [255, 0, 0],
        [0, 0, 255],
      ],
      8,
    )
    expect(palette).toHaveLength(2)
    expect(palette).toContainEqual([255, 0, 0])
    expect(palette).toContainEqual([0, 0, 255])
  })

  it('never returns more colors than requested', () => {
    const samples: [number, number, number][] = Array.from({ length: 64 }, (_, i) => [i * 4, 255 - i * 4, i])
    expect(buildPalette(samples, 5).length).toBeLessThanOrEqual(5)
  })
})

describe('quantize', () => {
  const options = { colors: 4, dither: false, alphaThreshold: 128 }

  it('keeps exact colors when the palette is large enough', () => {
    const out = quantize(downscaled(2, 1, [RED, BLUE]), options)
    expect(out).toEqual({ width: 2, height: 1, pixels: [['#ff0000', '#0000ff']] })
  })

  it('turns pixels below the alpha threshold transparent and the rest opaque', () => {
    const out = quantize(
      downscaled(2, 1, [
        [255, 0, 0, 100],
        [255, 0, 0, 200],
      ]),
      options,
    )
    expect(out.pixels[0]).toEqual([TRANSPARENT, '#ff0000'])
  })

  it('is all transparent when nothing is opaque', () => {
    const out = quantize(downscaled(2, 1, [CLEAR, CLEAR]), options)
    expect(out.pixels[0]).toEqual([TRANSPARENT, TRANSPARENT])
  })

  it('uses at most the requested number of colors, with or without dithering', () => {
    const gradient = Array.from({ length: 32 }, (_, i) => [i * 8, i * 8, i * 8, 255])
    for (const dither of [false, true]) {
      const out = quantize(downscaled(32, 1, gradient), { ...options, colors: 3, dither })
      expect(new Set(out.pixels[0]).size).toBeLessThanOrEqual(3)
    }
  })

  it('mixes the two nearest colors when dithering a mid tone', () => {
    // Black and white anchor the palette; the grey run between them must come out as a mix of both
    const row = [[0, 0, 0, 255], ...Array.from({ length: 8 }, () => [128, 128, 128, 255]), [255, 255, 255, 255]]
    const palette2 = { ...options, colors: 2 }
    const flat = quantize(downscaled(row.length, 1, row), palette2)
    const dithered = quantize(downscaled(row.length, 1, row), { ...palette2, dither: true })
    expect(new Set(flat.pixels[0].slice(1, -1)).size).toBe(1)
    expect(new Set(dithered.pixels[0].slice(1, -1)).size).toBe(2)
  })
})

describe('countColors', () => {
  it('counts every fully transparent pixel as one color', () => {
    expect(countColors(image(4, 1, [RED, BLUE, CLEAR, [9, 9, 9, 0]]), 100)).toBe(3)
  })

  it('stops once the limit is exceeded', () => {
    const many = Array.from({ length: 50 }, (_, i) => [i, 0, 0, 255])
    expect(countColors(image(50, 1, many), 10)).toBe(11)
  })
})
