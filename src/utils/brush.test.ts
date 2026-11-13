import { describe, expect, it } from 'vitest'
import { brushFootprints } from './brush'

describe('brushFootprints', () => {
  it('centres odd brushes on the point', () => {
    expect(brushFootprints(5, 5, 3, 32, 32)).toEqual([{ x: 4, y: 4, width: 3, height: 3 }])
  })

  it('puts the extra pixel of even brushes to the right and below', () => {
    expect(brushFootprints(5, 5, 2, 32, 32)).toEqual([{ x: 5, y: 5, width: 2, height: 2 }])
  })

  it('clips the brush at the canvas edges', () => {
    expect(brushFootprints(0, 0, 3, 32, 32)).toEqual([{ x: 0, y: 0, width: 2, height: 2 }])
  })

  it('adds the mirrored squares, symmetric for even sizes', () => {
    expect(brushFootprints(1, 2, 2, 10, 8, true, true)).toEqual([
      { x: 1, y: 2, width: 2, height: 2 },
      { x: 1, y: 4, width: 2, height: 2 },
      { x: 7, y: 2, width: 2, height: 2 },
      { x: 7, y: 4, width: 2, height: 2 },
    ])
  })

  it('does not repeat a brush that sits on the mirror axis', () => {
    expect(brushFootprints(4, 0, 2, 10, 8, true)).toEqual([{ x: 4, y: 0, width: 2, height: 2 }])
  })
})
