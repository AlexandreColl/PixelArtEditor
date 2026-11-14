import { describe, expect, it } from 'vitest'
import { addPngText, base64ToBytes, bytesToBase64, readPngText } from './pngText'

// A real 1x1 PNG
const PNG = base64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
)

describe('PNG text chunks', () => {
  it('writes a chunk that can be read back, keeping the image chunks', () => {
    const out = addPngText(PNG, 'pixel-art-editor', '{"frames":2}')
    expect(readPngText(out, 'pixel-art-editor')).toBe('{"frames":2}')
    expect(out.length).toBe(PNG.length + 12 + 'pixel-art-editor'.length + 1 + 12)
    // Everything after the header is the original file, IDAT and IEND included
    expect(out.subarray(out.length - (PNG.length - 33))).toEqual(PNG.subarray(33))
  })

  it('writes the CRC that PNG readers check', () => {
    const out = addPngText(PNG, 'k', 'v')
    // CRC-32 of "tEXtk\0v"
    const view = new DataView(out.buffer)
    expect(view.getUint32(33 + 8 + 3)).toBe(0xcb04f390)
  })

  it('returns null for other keywords and for files that are not PNG', () => {
    expect(readPngText(addPngText(PNG, 'a', 'x'), 'b')).toBeNull()
    expect(readPngText(PNG, 'a')).toBeNull()
    expect(readPngText(new Uint8Array([1, 2, 3]), 'a')).toBeNull()
    expect(() => addPngText(new Uint8Array(40), 'a', 'x')).toThrow()
  })

  it('converts large files to base64 and back', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})
