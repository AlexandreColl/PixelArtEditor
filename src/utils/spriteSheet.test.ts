import { describe, expect, it } from 'vitest'
import { TRANSPARENT as T } from './color'
import { framesToSheet, parseAnimationInfo, serializeAnimationInfo, sheetToFrames } from './spriteSheet'

const R = '#ff0000'
const G = '#00ff00'
const B = '#0000ff'

describe('framesToSheet', () => {
  it('puts the frames side by side by default', () => {
    expect(framesToSheet([[[R]], [[G]], [[B]]], 1, 1)).toEqual({ pixels: [[R, G, B]], width: 3, height: 1 })
  })

  it('wraps into rows and leaves the unused cells transparent', () => {
    expect(framesToSheet([[[R]], [[G]], [[B]]], 1, 1, 2)).toEqual({
      pixels: [
        [R, G],
        [B, T],
      ],
      width: 2,
      height: 2,
    })
  })
})

describe('sheetToFrames', () => {
  const sheet = [
    [R, R, G, G, T, T],
    [R, R, G, G, T, T],
  ]

  it('cuts the sheet into frames and drops empty ones at the end', () => {
    expect(sheetToFrames(sheet, 6, 2, 2, 2)).toEqual([
      [
        [R, R],
        [R, R],
      ],
      [
        [G, G],
        [G, G],
      ],
    ])
  })

  it('keeps exactly the frame count it is given, empty ones included', () => {
    expect(sheetToFrames(sheet, 6, 2, 2, 2, 3)).toHaveLength(3)
  })

  it('reads rows left to right, then top to bottom, ignoring cells that do not fit whole', () => {
    const grid = [
      [R, G, T],
      [B, R, T],
    ]
    expect(sheetToFrames(grid, 3, 2, 1, 1, 5).map(f => f[0][0])).toEqual([R, G, T, B, R])
    expect(sheetToFrames(grid, 3, 2, 2, 2)).toHaveLength(1)
  })

  it('round trips with framesToSheet', () => {
    const frames = [[[R, G]], [[B, T]], [[G, G]]]
    const { pixels, width, height } = framesToSheet(frames, 2, 1, 2)
    expect(sheetToFrames(pixels, width, height, 2, 1, 3)).toEqual(frames)
  })
})

describe('parseAnimationInfo', () => {
  const info = { frames: 3, frameWidth: 16, frameHeight: 8, columns: 2, fps: 12 }

  it('reads back what was saved when it matches the image size', () => {
    expect(parseAnimationInfo(serializeAnimationInfo(info), 32, 16)).toEqual(info)
  })

  it('ignores missing, broken or mismatched data', () => {
    expect(parseAnimationInfo(null, 32, 16)).toBeNull()
    expect(parseAnimationInfo('{not json', 32, 16)).toBeNull()
    expect(parseAnimationInfo(serializeAnimationInfo({ ...info, fps: 0 }), 32, 16)).toBeNull()
    // The image was edited elsewhere and no longer has the saved size
    expect(parseAnimationInfo(serializeAnimationInfo(info), 48, 16)).toBeNull()
  })
})
