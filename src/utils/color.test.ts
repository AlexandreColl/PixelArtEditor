import { describe, expect, it } from 'vitest'
import { TRANSPARENT, formatColor, hsvToRgb, normalizeColor, parseColor, parseHexInput, rgbToHsv, toHex } from './color'

describe('parseColor', () => {
  it('parses every hex length', () => {
    expect(parseColor('#f00')).toEqual([255, 0, 0, 255])
    expect(parseColor('#f008')).toEqual([255, 0, 0, 136])
    expect(parseColor('#00ff00')).toEqual([0, 255, 0, 255])
    expect(parseColor('#0000ff80')).toEqual([0, 0, 255, 128])
  })

  it('parses rgb() and rgba(), clamping out-of-range values', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 255])
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual([10, 20, 30, 128])
    expect(parseColor('rgba(300,0,0,2)')).toEqual([255, 0, 0, 255])
  })

  it('ignores case and surrounding spaces', () => {
    expect(parseColor('  #ABCDEF ')).toEqual([171, 205, 239, 255])
    expect(parseColor('Transparent')).toEqual([0, 0, 0, 0])
  })

  it('rejects anything else', () => {
    for (const bad of ['', '#12', '#12345', 'red', 'rgb(1,2)', 'hsl(0,0%,0%)', null, undefined, 42, {}]) {
      expect(parseColor(bad)).toBeNull()
    }
  })
})

describe('formatColor', () => {
  it('uses #rrggbb for opaque colors', () => {
    expect(formatColor([255, 128, 0, 255])).toBe('#ff8000')
  })

  it('uses the shared TRANSPARENT value whatever the RGB channels', () => {
    expect(formatColor([12, 34, 56, 0])).toBe(TRANSPARENT)
  })

  it('uses rgba() for partial alpha', () => {
    expect(formatColor([1, 2, 3, 128])).toBe('rgba(1,2,3,0.502)')
  })
})

describe('normalizeColor', () => {
  it('maps equivalent spellings to one canonical string', () => {
    expect(normalizeColor('#F00')).toBe('#ff0000')
    expect(normalizeColor('rgb(255,0,0)')).toBe('#ff0000')
    expect(normalizeColor('transparent')).toBe(TRANSPARENT)
    expect(normalizeColor('#00000000')).toBe(TRANSPARENT)
  })

  it('round-trips its own output', () => {
    for (const c of ['#123456', TRANSPARENT, 'rgba(1,2,3,0.502)']) {
      expect(normalizeColor(c)).toBe(c)
    }
  })

  it('returns null for invalid colors', () => {
    expect(normalizeColor('nope')).toBeNull()
  })
})

describe('toHex', () => {
  it('pads every channel to two digits and drops alpha', () => {
    expect(toHex([0, 10, 255, 7])).toBe('#000aff')
  })
})

describe('rgbToHsv / hsvToRgb', () => {
  it('converts the primary colors, grays and black', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual([0, 1, 1])
    expect(rgbToHsv(0, 255, 0)).toEqual([120, 1, 1])
    expect(rgbToHsv(0, 0, 255)).toEqual([240, 1, 1])
    expect(rgbToHsv(128, 128, 128)).toEqual([0, 0, 128 / 255])
    expect(rgbToHsv(0, 0, 0)).toEqual([0, 0, 0])
  })

  it('round-trips any color', () => {
    for (const rgb of [
      [255, 0, 0],
      [26, 28, 44],
      [177, 62, 83],
      [255, 205, 117],
      [1, 2, 3],
      [255, 255, 255],
    ] as [number, number, number][]) {
      expect(hsvToRgb(...rgbToHsv(...rgb))).toEqual(rgb)
    }
  })
})

describe('parseHexInput', () => {
  it('accepts short and long hex, with or without #, in any case', () => {
    expect(parseHexInput('#FFF')).toBe('#ffffff')
    expect(parseHexInput(' 1a1c2c ')).toBe('#1a1c2c')
    expect(parseHexInput('#B13E53')).toBe('#b13e53')
  })

  it('rejects anything else, including colors with alpha', () => {
    for (const bad of ['', '#12', '12345', 'red', '#ff000080', 'gggggg']) expect(parseHexInput(bad)).toBeNull()
  })
})
