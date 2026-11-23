import { describe, expect, it } from 'vitest'
import { cleanDuration, frameDurations, hasCustomDurations, normalizeDurations } from './timing'

describe('frame timing', () => {
  it('reads typed durations as whole milliseconds within limits', () => {
    expect(cleanDuration('120')).toBe(120)
    expect(cleanDuration(99.6)).toBe(100)
    expect(cleanDuration('3')).toBe(10)
    expect(cleanDuration(999999)).toBe(10000)
  })

  it('treats empty or unreadable values as following fps', () => {
    for (const v of ['', '  ', 'abc', 0, -5, null, undefined, NaN]) expect(cleanDuration(v)).toBeNull()
  })

  it('gives each frame its own duration or the one of the speed', () => {
    expect(frameDurations(3, 10, [null, 250])).toEqual([100, 250, 100])
  })

  it('fits the durations of a file to its frames', () => {
    expect(normalizeDurations([200, 'x', 50, 70], 3)).toEqual([200, null, 50])
    expect(normalizeDurations(undefined, 2)).toEqual([null, null])
    expect(hasCustomDurations([null, null])).toBe(false)
    expect(hasCustomDurations([null, 80])).toBe(true)
  })
})
