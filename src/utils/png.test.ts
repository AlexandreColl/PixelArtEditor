import { afterEach, describe, expect, it, vi } from 'vitest'
import { pixelsToPngDataUrl } from './png'

/** Records the canvas calls, since Node has no canvas to draw on. */
function stubCanvas() {
  const rects: { fill: string; x: number; y: number; w: number; h: number }[] = []
  const ctx = {
    fillStyle: '',
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ fill: ctx.fillStyle, x, y, w, h }),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: (type: string) => `data:${type};base64,stub`,
  }
  vi.stubGlobal('document', { createElement: () => canvas })
  return { canvas, rects }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pixelsToPngDataUrl', () => {
  const pixels = [
    ['#ff0000', '#00ff00'],
    ['#0000ff', 'rgba(0,0,0,0)'],
  ]

  it('draws one pixel per cell at scale 1', () => {
    const { canvas, rects } = stubCanvas()
    expect(pixelsToPngDataUrl(pixels, 2, 2)).toBe('data:image/png;base64,stub')
    expect([canvas.width, canvas.height]).toEqual([2, 2])
    expect(rects).toHaveLength(4)
    expect(rects).toContainEqual({ fill: '#00ff00', x: 1, y: 0, w: 1, h: 1 })
  })

  it('draws each pixel as a scale x scale block', () => {
    const { canvas, rects } = stubCanvas()
    pixelsToPngDataUrl(pixels, 2, 2, 4)
    expect([canvas.width, canvas.height]).toEqual([8, 8])
    expect(rects).toContainEqual({ fill: '#0000ff', x: 0, y: 4, w: 4, h: 4 })
  })
})
