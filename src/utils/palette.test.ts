import { describe, expect, it } from 'vitest'
import { formatForPath, parsePalette, serializePalette } from './palette'

const GPL = `GIMP Palette
Name: Sunset
Columns: 4
# A comment
255   0   0	Red
  0 128 255	Sky
 12  34  56
`

describe('parsePalette', () => {
  it('reads a GIMP palette with its name, ignoring comments and headers', () => {
    expect(parsePalette(GPL, 'sunset.gpl')).toEqual({ name: 'Sunset', colors: ['#ff0000', '#0080ff', '#0c2238'] })
  })

  it('uses the file name when a GIMP palette has no Name line', () => {
    expect(parsePalette('GIMP Palette\n1 2 3\n', 'C:\\pals\\retro.gpl').name).toBe('retro')
  })

  it('accepts Windows line endings and a byte order mark', () => {
    expect(parsePalette('\uFEFFGIMP Palette\r\n255 255 255 White\r\n', 'w.gpl').colors).toEqual(['#ffffff'])
  })

  it('reads a Lospec .hex palette, with or without #', () => {
    expect(parsePalette('ff0000\n#00FF00\n\n0000ff\n', 'pico.hex')).toEqual({
      name: 'pico',
      colors: ['#ff0000', '#00ff00', '#0000ff'],
    })
  })

  it('drops duplicate colors', () => {
    expect(parsePalette('ff0000\nFF0000\n', 'dup.hex').colors).toEqual(['#ff0000'])
  })

  it('rejects a .gpl file without the GIMP header', () => {
    expect(() => parsePalette('255 0 0\n', 'bad.gpl')).toThrow(/GIMP Palette/)
  })

  it('rejects a file without colors', () => {
    expect(() => parsePalette('hello\nworld\n', 'empty.hex')).toThrow(/No colors/)
  })
})

describe('serializePalette', () => {
  const palette = { name: 'Sunset', colors: ['#ff0000', '#0080ff'] }

  it('writes a GIMP palette', () => {
    expect(serializePalette(palette, 'gpl')).toBe(
      'GIMP Palette\nName: Sunset\nColumns: 8\n#\n255   0   0\t#ff0000\n  0 128 255\t#0080ff\n',
    )
  })

  it('writes a Lospec .hex palette', () => {
    expect(serializePalette(palette, 'hex')).toBe('ff0000\n0080ff\n')
  })

  it('round-trips through both formats', () => {
    for (const format of ['gpl', 'hex'] as const) {
      const parsed = parsePalette(serializePalette(palette, format), `Sunset.${format}`)
      expect(parsed).toEqual(palette)
    }
  })

  it('keeps a multi-line name on its own line', () => {
    expect(serializePalette({ name: 'a\nb', colors: ['#000000'] }, 'gpl')).toContain('Name: a b\n')
  })
})

describe('formatForPath', () => {
  it('picks the format from the extension, defaulting to GIMP', () => {
    expect(formatForPath('C:\\x\\pal.HEX')).toBe('hex')
    expect(formatForPath('/x/pal.gpl')).toBe('gpl')
    expect(formatForPath('/x/pal')).toBe('gpl')
  })
})
