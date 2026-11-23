import { describe, expect, it } from 'vitest'
import type { Layer, PixelData } from '../types'
import { TRANSPARENT as T } from './color'
import { blendOver, flattenFrame, flattenFrameCached, flattenPixel } from './layers'

const layer = (props: Partial<Layer> = {}): Layer => ({ id: 0, name: 'L', visible: true, opacity: 1, ...props })
const cel = (pixels: string[][]): PixelData => ({ width: pixels[0].length, height: pixels.length, pixels })

describe('blendOver', () => {
  it('covers what is below with an opaque color and leaves it under a transparent one', () => {
    expect(blendOver([0, 0, 255, 255], [255, 0, 0, 255])).toEqual([255, 0, 0, 255])
    expect(blendOver([0, 0, 255, 255], [255, 0, 0, 0])).toEqual([0, 0, 255, 255])
  })

  it('mixes by the layer opacity and the pixel alpha', () => {
    expect(blendOver([0, 0, 0, 255], [255, 255, 255, 255], 0.5)).toEqual([128, 128, 128, 255])
    // Over nothing, a half transparent pixel keeps its color and gets the alpha
    expect(blendOver([0, 0, 0, 0], [255, 0, 0, 255], 0.5)).toEqual([255, 0, 0, 128])
  })
})

describe('flattenFrame', () => {
  const bottom = cel([['#0000ff', '#0000ff']])
  const top = cel([['#ff0000', T]])

  it('draws the layers bottom first, the upper ones covering the lower', () => {
    expect(flattenFrame([bottom, top], [layer(), layer()]).pixels).toEqual([['#ff0000', '#0000ff']])
  })

  it('leaves out hidden layers and blends by opacity', () => {
    expect(flattenFrame([bottom, top], [layer(), layer({ visible: false })]).pixels).toEqual([['#0000ff', '#0000ff']])
    expect(flattenFrame([bottom, top], [layer(), layer({ opacity: 0.5 })]).pixels).toEqual([['#800080', '#0000ff']])
  })

  it('returns the cel itself when it is the only layer shown, and transparent when none is', () => {
    expect(flattenFrame([bottom, top], [layer(), layer({ visible: false })])).toBe(bottom)
    expect(flattenFrame([bottom], [layer({ visible: false })]).pixels).toEqual([[T, T]])
  })

  it('remembers the result until the cels or the layers change', () => {
    const cels = [bottom, top]
    const layers = [layer(), layer()]
    const first = flattenFrameCached(cels, layers)
    expect(flattenFrameCached(cels, layers)).toBe(first)
    expect(flattenFrameCached(cels, [layer(), layer({ visible: false })])).not.toBe(first)
  })
})

describe('flattenFrame with many layers', () => {
  // A small image with every kind of pixel: opaque, translucent, transparent and unreadable
  const colors = ['#ff0000', 'rgba(0,128,255,0.4)', T, '#00ff0080', '#123456', 'rgba(255,255,0,0.75)', 'nonsense']
  const grid = (seed: number) =>
    cel(
      Array.from({ length: 6 }, (_, y) =>
        Array.from({ length: 7 }, (_cell, x) => colors[(x * 3 + y * 5 + seed) % colors.length]),
      ),
    )
  const cels = [grid(0), grid(1), grid(2)]
  const layers = [layer(), layer({ opacity: 0.6 }), layer({ opacity: 0.3 })]

  it('gives the same colors as blending pixel by pixel', () => {
    const { pixels } = flattenFrame(cels, layers)
    pixels.forEach((row, y) => row.forEach((c, x) => expect(c).toBe(flattenPixel(cels, layers, x, y))))
  })

  it('reuses the rows no layer changed and blends again the ones that did', () => {
    const first = flattenFrame(cels, layers)
    const edited = { ...cels[1], pixels: cels[1].pixels.map((row, y) => (y === 2 ? row.map(() => '#ffffff') : row)) }
    const second = flattenFrame([cels[0], edited, cels[2]], layers)
    expect(second.pixels[0]).toBe(first.pixels[0])
    expect(second.pixels[2]).not.toBe(first.pixels[2])
    expect(second.pixels[2][0]).toBe(flattenPixel([cels[0], edited, cels[2]], layers, 0, 2))
    // A new opacity blends every row again
    const faded = flattenFrame(cels, [layer(), layer({ opacity: 0.5 }), layer({ opacity: 0.3 })])
    expect(faded.pixels[0]).not.toBe(first.pixels[0])
  })
})

describe('flattenPixel', () => {
  it('gives the color shown at one pixel', () => {
    const cels = [cel([['#0000ff']]), cel([['rgba(255,0,0,0.5)']])]
    // 50% is stored as alpha 128 of 255, a hair over half, so blue keeps 127
    expect(flattenPixel(cels, [layer(), layer()], 0, 0)).toBe('#80007f')
    expect(flattenPixel(cels, [layer({ visible: false }), layer({ visible: false })], 0, 0)).toBe(T)
  })
})
