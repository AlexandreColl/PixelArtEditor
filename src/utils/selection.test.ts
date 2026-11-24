import { describe, expect, it } from 'vitest'
import { TRANSPARENT as T } from './color'
import {
  clampSelection,
  clearSelected,
  extractSelected,
  isSelected,
  lassoSelection,
  magicWandSelection,
  selectionEdges,
} from './selection'

const R = '#ff0000'
const B = '#0000ff'

// An L of red in a blue square, and a red pixel apart that does not touch it
const image = [
  [R, B, B, R],
  [R, B, B, B],
  [R, R, B, B],
]

describe('magic wand', () => {
  it('selects the touching area of the same color, not the same color elsewhere', () => {
    const sel = magicWandSelection(image, 0, 0)!
    expect(sel).toMatchObject({ x: 0, y: 0, width: 2, height: 3 })
    expect(sel.mask).toEqual([
      [true, false],
      [true, false],
      [true, true],
    ])
    expect(isSelected(sel, 3, 0)).toBe(false)
  })

  it('leaves out the mask when the area is a full rectangle', () => {
    expect(magicWandSelection(image, 3, 0)).toEqual({ x: 3, y: 0, width: 1, height: 1 })
  })

  it('selects nothing outside the canvas', () => {
    expect(magicWandSelection(image, 9, 9)).toBeNull()
  })
})

describe('lasso', () => {
  it('selects what the outline encloses and the pixels it goes through', () => {
    // A triangle with its corners at (0,0), (4,0) and (0,4)
    const sel = lassoSelection(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      8,
      8,
    )!
    expect(sel).toMatchObject({ x: 0, y: 0, width: 5, height: 5 })
    expect(isSelected(sel, 1, 1)).toBe(true)
    expect(isSelected(sel, 4, 4)).toBe(false)
    expect(isSelected(sel, 4, 0)).toBe(true)
  })

  it('stays inside the canvas', () => {
    const sel = lassoSelection(
      [
        { x: -3, y: -3 },
        { x: 2, y: -3 },
        { x: 2, y: 2 },
        { x: -3, y: 2 },
      ],
      4,
      4,
    )
    expect(sel).toEqual({ x: 0, y: 0, width: 3, height: 3 })
  })
})

describe('selected pixels', () => {
  const sel = magicWandSelection(image, 0, 0)!

  it('copies only the selected pixels', () => {
    expect(extractSelected(image, sel)).toEqual([
      [R, T],
      [R, T],
      [R, R],
    ])
  })

  it('clears only the selected pixels', () => {
    expect(clearSelected(image, sel)).toEqual([
      [T, B, B, R],
      [T, B, B, B],
      [T, T, B, B],
    ])
  })

  it('crops the mask with the selection at the canvas edge', () => {
    const moved = { ...sel, x: -1 }
    expect(clampSelection(moved, 4, 3)).toEqual({ x: 0, y: 0, width: 1, height: 3, mask: [[false], [false], [true]] })
    expect(clampSelection({ ...sel, x: -1, height: 2, mask: sel.mask!.slice(0, 2) }, 4, 3)).toBeNull()
  })

  it('outlines the shape, not its rectangle', () => {
    // An L of four pixels has ten edges
    expect(selectionEdges(sel)).toHaveLength(10)
    expect(selectionEdges({ x: 0, y: 0, width: 2, height: 2 })).toHaveLength(8)
  })
})
