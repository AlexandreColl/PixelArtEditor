import { describe, expect, it } from 'vitest'
import { guessFrameSize } from './SpriteSheetDialog'

describe('guessFrameSize', () => {
  it('guesses square frames along a horizontal or vertical strip', () => {
    expect(guessFrameSize(128, 32)).toEqual([32, 32])
    expect(guessFrameSize(16, 64)).toEqual([16, 16])
  })

  it('takes the whole image when it is not a clean strip', () => {
    expect(guessFrameSize(100, 30)).toEqual([100, 30])
    expect(guessFrameSize(64, 64)).toEqual([64, 64])
  })
})
