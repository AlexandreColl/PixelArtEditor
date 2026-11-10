import { describe, expect, it } from 'vitest'
import { ellipsePoints, linePoints, rectPoints, shapePoints, type Point } from './shapes'

const key = ([x, y]: Point) => `${x},${y}`
const keys = (points: Point[]) => new Set(points.map(key))

describe('linePoints', () => {
  it('includes both ends', () => {
    const points = linePoints(2, 3, 7, 5)
    expect(points[0]).toEqual([2, 3])
    expect(points[points.length - 1]).toEqual([7, 5])
  })

  it('is a single pixel when both ends are the same', () => {
    expect(linePoints(4, 4, 4, 4)).toEqual([[4, 4]])
  })

  it('has one pixel per step along the long axis, with no gaps', () => {
    const points = linePoints(0, 0, 9, 3)
    expect(points).toHaveLength(10)
    for (let i = 1; i < points.length; i++) {
      expect(Math.abs(points[i][0] - points[i - 1][0])).toBeLessThanOrEqual(1)
      expect(Math.abs(points[i][1] - points[i - 1][1])).toBeLessThanOrEqual(1)
    }
  })

  it('covers the same pixels in both directions for straight and diagonal lines', () => {
    for (const [x0, y0, x1, y1] of [
      [0, 0, 6, 0],
      [0, 0, 0, 6],
      [0, 0, 6, 6],
      [6, 0, 0, 6],
    ]) {
      expect(keys(linePoints(x1, y1, x0, y0))).toEqual(keys(linePoints(x0, y0, x1, y1)))
    }
  })
})

describe('rectPoints', () => {
  it('fills the whole area when filled', () => {
    expect(rectPoints(1, 1, 3, 4, true)).toHaveLength(3 * 4)
  })

  it('draws only the border when not filled', () => {
    const points = rectPoints(0, 0, 4, 3, false)
    expect(points).toHaveLength(2 * 5 + 2 * 2)
    expect(keys(points).has('2,1')).toBe(false)
  })

  it('accepts the corners in any order', () => {
    expect(keys(rectPoints(5, 6, 1, 2, false))).toEqual(keys(rectPoints(1, 2, 5, 6, false)))
  })
})

describe('ellipsePoints', () => {
  it('is a single pixel for a 1x1 box', () => {
    expect(ellipsePoints(3, 3, 3, 3, false)).toEqual([[3, 3]])
  })

  it('stays inside its bounding box', () => {
    for (const [x, y] of ellipsePoints(2, 1, 12, 7, true)) {
      expect(x).toBeGreaterThanOrEqual(2)
      expect(x).toBeLessThanOrEqual(12)
      expect(y).toBeGreaterThanOrEqual(1)
      expect(y).toBeLessThanOrEqual(7)
    }
  })

  it('touches all four sides of the box', () => {
    const points = ellipsePoints(0, 0, 9, 5, false)
    const xs = points.map(p => p[0])
    const ys = points.map(p => p[1])
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 9, 0, 5])
  })

  it('is symmetric on both axes, for odd and even sizes', () => {
    for (const [w, h] of [
      [7, 5],
      [8, 6],
    ]) {
      const set = keys(ellipsePoints(0, 0, w - 1, h - 1, false))
      for (const k of set) {
        const [x, y] = k.split(',').map(Number)
        expect(set.has(`${w - 1 - x},${y}`)).toBe(true)
        expect(set.has(`${x},${h - 1 - y}`)).toBe(true)
      }
    }
  })

  it('has an outline that is a subset of the filled shape', () => {
    const filled = keys(ellipsePoints(0, 0, 10, 8, true))
    const outline = ellipsePoints(0, 0, 10, 8, false)
    expect(outline.length).toBeLessThan(filled.size)
    for (const p of outline) expect(filled.has(key(p))).toBe(true)
  })
})

describe('shapePoints', () => {
  it('dispatches to the right shape', () => {
    expect(shapePoints('line', 0, 0, 3, 3, true)).toEqual(linePoints(0, 0, 3, 3))
    expect(shapePoints('rect', 0, 0, 3, 3, true)).toEqual(rectPoints(0, 0, 3, 3, true))
    expect(shapePoints('ellipse', 0, 0, 3, 3, false)).toEqual(ellipsePoints(0, 0, 3, 3, false))
  })
})
