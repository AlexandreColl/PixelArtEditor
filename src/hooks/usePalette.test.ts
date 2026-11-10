// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { DEFAULT_PALETTE, MAX_PALETTE_COLORS, cleanColors, usePalette } from './usePalette'

beforeEach(() => {
  localStorage.clear()
})

function setup() {
  const { result, unmount } = renderHook(() => usePalette())
  const run = (fn: (p: ReturnType<typeof usePalette>) => void) => act(() => fn(result.current))
  return { result, run, unmount }
}

describe('cleanColors', () => {
  it('normalizes, drops duplicates and keeps only opaque valid colors', () => {
    expect(cleanColors(['#F00', 'rgb(255,0,0)', '#00ff00', 'rgba(0,0,255,0.5)', 'transparent', 'nope', 7])).toEqual([
      '#ff0000',
      '#00ff00',
    ])
  })

  it('stops at the palette size limit', () => {
    const many = Array.from({ length: 300 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`)
    expect(cleanColors(many)).toHaveLength(MAX_PALETTE_COLORS)
  })
})

describe('usePalette', () => {
  it('starts with the default palette', () => {
    const { result } = setup()
    expect(result.current.palette.colors).toEqual(DEFAULT_PALETTE)
  })

  it('adds a new color at the end, but not a duplicate', () => {
    const { result, run } = setup()
    let added = false
    run(p => {
      added = p.addColor('#123456')
    })
    expect(added).toBe(true)
    expect(result.current.palette.colors.at(-1)).toBe('#123456')

    run(p => {
      added = p.addColor('#123456')
    })
    expect(added).toBe(false)
    expect(result.current.palette.colors).toHaveLength(DEFAULT_PALETTE.length + 1)
  })

  it('removes a color but never the last one', () => {
    const { result, run } = setup()
    run(p => p.replacePalette('Two', ['#111111', '#222222']))
    run(p => p.removeColor('#111111'))
    expect(result.current.palette.colors).toEqual(['#222222'])
    run(p => p.removeColor('#222222'))
    expect(result.current.palette.colors).toEqual(['#222222'])
  })

  it('moves a color to a new position', () => {
    const { result, run } = setup()
    run(p => p.replacePalette('Abc', ['#aaaaaa', '#bbbbbb', '#cccccc']))
    run(p => p.moveColor(0, 2))
    expect(result.current.palette.colors).toEqual(['#bbbbbb', '#cccccc', '#aaaaaa'])
    run(p => p.moveColor(2, 0))
    expect(result.current.palette.colors).toEqual(['#aaaaaa', '#bbbbbb', '#cccccc'])
  })

  it('keeps the current palette when a replacement has no valid colors', () => {
    const { result, run } = setup()
    let ok = true
    run(p => {
      ok = p.replacePalette('Empty', ['nope'])
    })
    expect(ok).toBe(false)
    expect(result.current.palette.colors).toEqual(DEFAULT_PALETTE)
  })

  it('remembers the palette between sessions', () => {
    const first = setup()
    first.run(p => p.replacePalette('Mine', ['#010203', '#040506']))
    first.unmount()

    const { result } = setup()
    expect(result.current.palette).toEqual({ name: 'Mine', colors: ['#010203', '#040506'] })
  })

  it('falls back to the default palette when the stored one is unreadable', () => {
    localStorage.setItem('palette', '{not json')
    expect(setup().result.current.palette.colors).toEqual(DEFAULT_PALETTE)
    localStorage.setItem('palette', JSON.stringify({ name: 'Bad', colors: ['nope'] }))
    expect(setup().result.current.palette.colors).toEqual(DEFAULT_PALETTE)
  })

  it('resets to the default palette', () => {
    const { result, run } = setup()
    run(p => p.replacePalette('Mine', ['#010203']))
    run(p => p.resetPalette())
    expect(result.current.palette).toEqual({ name: 'Default', colors: DEFAULT_PALETTE })
  })
})
