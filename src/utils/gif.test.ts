import { describe, expect, it } from 'vitest'
import { TRANSPARENT as T } from './color'
import { encodeGif, frameDelays, lzwEncode } from './gif'

/** GIF LZW decoder, written from the spec, to check the encoder against. */
function lzwDecode(data: Uint8Array, minCodeSize: number, length: number): number[] {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  let codeSize = minCodeSize + 1
  let dict: number[][] = []
  const reset = () => {
    dict = Array.from({ length: clear }, (_, i) => [i])
    dict.push([], [])
    codeSize = minCodeSize + 1
  }
  reset()
  const out: number[] = []
  let pos = 0
  let prev: number[] | null = null
  while (out.length < length) {
    let code = 0
    for (let i = 0; i < codeSize; i++, pos++) code |= ((data[pos >> 3] >> (pos & 7)) & 1) << i
    if (code === clear) {
      reset()
      prev = null
      continue
    }
    if (code === eoi) break
    const entry: number[] = code < dict.length ? dict[code] : [...prev!, prev![0]]
    out.push(...entry)
    if (prev) dict.push([...prev, entry[0]])
    prev = entry
    if (dict.length === 1 << codeSize && codeSize < 12) codeSize++
  }
  return out
}

/** Reads back what encodeGif writes: size, color table, and each frame's delay, transparency and indices. */
function decodeGif(gif: Uint8Array) {
  const text = (at: number, n: number) => String.fromCharCode(...gif.subarray(at, at + n))
  const u16 = (at: number) => gif[at] | (gif[at + 1] << 8)
  expect(text(0, 6)).toBe('GIF89a')
  const width = u16(6)
  const height = u16(8)
  const tableSize = 1 << ((gif[10] & 7) + 1)
  const table = Array.from({ length: tableSize }, (_, i) => [...gif.subarray(13 + i * 3, 16 + i * 3)])
  let pos = 13 + tableSize * 3
  const frames: { delay: number; transparent: boolean; indices: number[] }[] = []
  let loops = false
  let pending = { delay: 0, transparent: false }
  const readBlocks = () => {
    const parts: number[] = []
    while (gif[pos] !== 0) {
      parts.push(...gif.subarray(pos + 1, pos + 1 + gif[pos]))
      pos += gif[pos] + 1
    }
    pos++
    return Uint8Array.from(parts)
  }
  while (gif[pos] !== 0x3b) {
    if (gif[pos] === 0x21 && gif[pos + 1] === 0xf9) {
      pending = { delay: u16(pos + 4), transparent: (gif[pos + 3] & 1) === 1 }
      pos += 8
    } else if (gif[pos] === 0x21 && gif[pos + 1] === 0xff) {
      loops = text(pos + 3, 11) === 'NETSCAPE2.0'
      pos += 14
      readBlocks()
    } else if (gif[pos] === 0x2c) {
      const minCodeSize = gif[pos + 10]
      pos += 11
      frames.push({ ...pending, indices: lzwDecode(readBlocks(), minCodeSize, width * height) })
    } else {
      throw new Error(`unexpected byte ${gif[pos]} at ${pos}`)
    }
  }
  return { width, height, table, frames, loops }
}

const hex = (rgb: number[]) => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('')

describe('lzwEncode', () => {
  it('round trips long and repetitive data, past a full code table', () => {
    const data = Uint8Array.from({ length: 20000 }, (_, i) => (i * 7 + (i >> 5)) % 4)
    expect(lzwDecode(lzwEncode(data, 2), 2, data.length)).toEqual([...data])
  })

  it('round trips a single index', () => {
    expect(lzwDecode(lzwEncode(Uint8Array.of(1), 2), 2, 1)).toEqual([1])
  })
})

describe('frameDelays', () => {
  it('keeps the exact speed over a loop, in hundredths of a second', () => {
    expect(frameDelays(4, 10)).toEqual([10, 10, 10, 10])
    const eight = frameDelays(8, 8)
    expect(eight.reduce((a, b) => a + b)).toBe(100)
    expect(new Set(eight)).toEqual(new Set([12, 13]))
  })
})

describe('encodeGif', () => {
  const R = '#ff0000'
  const B = '#0000ff'

  it('stores every frame with its colors, transparency, speed and endless loop', () => {
    const frames = [
      [
        [R, T],
        [T, B],
      ],
      [
        [B, B],
        [R, 'rgba(0, 0, 0, 0.2)'],
      ],
    ]
    const gif = decodeGif(encodeGif(frames, 2, 2, { fps: 4 }))
    expect([gif.width, gif.height, gif.loops]).toEqual([2, 2, true])
    expect(gif.frames.map(f => [f.delay, f.transparent])).toEqual([
      [25, true],
      [25, true],
    ])
    const colorsOf = (indices: number[]) => indices.map(i => (i === 0 ? T : hex(gif.table[i])))
    expect(colorsOf(gif.frames[0].indices)).toEqual([R, T, T, B])
    // Mostly transparent pixels become transparent
    expect(colorsOf(gif.frames[1].indices)).toEqual([B, B, R, T])
  })

  it('scales every pixel to a block', () => {
    const gif = decodeGif(encodeGif([[[R, B]]], 2, 1, { fps: 1, scale: 2 }))
    expect([gif.width, gif.height]).toEqual([4, 2])
    expect(gif.frames[0].indices.map(i => hex(gif.table[i]))).toEqual([R, R, B, B, R, R, B, B])
    expect(gif.frames[0].transparent).toBe(false)
  })

  it('reduces to 256 colors when there are more', () => {
    const row = Array.from({ length: 300 }, (_, i) => `#${(i * 50000).toString(16).padStart(6, '0').slice(-6)}`)
    const gif = decodeGif(encodeGif([[row]], 300, 1, { fps: 1 }))
    expect(gif.table).toHaveLength(256)
    expect(gif.frames[0].indices).toHaveLength(300)
  })
})
