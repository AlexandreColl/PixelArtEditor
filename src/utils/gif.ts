// A small GIF89a encoder for exporting animations. Pixel art rarely has more than 255 colors;
// when it does, the colors are reduced with the same median cut as the image conversion.
import { parseColor } from './color'
import { type RGB, buildPalette, nearest } from './pixelate'

export interface GifOptions {
  fps: number
  /** Every pixel becomes a scale x scale block */
  scale?: number
}

/** Pixels below this alpha are transparent in the GIF, which has no partial transparency; the rest are opaque. */
const ALPHA_CUTOFF = 128
const MAX_CODE = 4096

/** Delays in hundredths of a second, rounded so the total keeps the exact speed instead of drifting. */
export function frameDelays(count: number, fps: number): number[] {
  const at = (i: number) => Math.round((i * 100) / fps)
  return Array.from({ length: count }, (_, i) => at(i + 1) - at(i))
}

/** The colors of every frame as palette indices, with index 0 for transparent when any pixel is. */
function indexFrames(frames: string[][][], width: number, height: number) {
  const rgba = frames.map(frame => frame.flatMap(row => row.map(c => parseColor(c) ?? [0, 0, 0, 0])))
  let transparent = false
  const unique = new Map<number, RGB>()
  for (const frame of rgba) {
    for (const [r, g, b, a] of frame) {
      if (a < ALPHA_CUTOFF) transparent = true
      else unique.set((r << 16) | (g << 8) | b, [r, g, b])
    }
  }

  const room = 256 - (transparent ? 1 : 0)
  const colors = unique.size <= room ? [...unique.values()] : buildPalette([...unique.values()], room)
  const offset = transparent ? 1 : 0
  const exact = new Map<number, number>()
  colors.forEach(([r, g, b], i) => exact.set((r << 16) | (g << 8) | b, i + offset))
  const lookup = (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b
    let index = exact.get(key)
    if (index === undefined) {
      index = colors.indexOf(nearest(colors, r, g, b)) + offset
      exact.set(key, index)
    }
    return index
  }

  const indices = rgba.map(frame => {
    const out = new Uint8Array(width * height)
    frame.forEach(([r, g, b, a], i) => (out[i] = a < ALPHA_CUTOFF ? 0 : lookup(r, g, b)))
    return out
  })
  const table: RGB[] = transparent ? [[0, 0, 0], ...colors] : colors
  return { indices, table, transparent }
}

function scaleIndices(src: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  if (scale === 1) return src
  const w = width * scale
  const out = new Uint8Array(w * height * scale)
  for (let y = 0; y < height * scale; y++) {
    const row = Math.floor(y / scale) * width
    for (let x = 0; x < w; x++) out[y * w + x] = src[row + Math.floor(x / scale)]
  }
  return out
}

/** GIF's variable-length LZW, packed least significant bit first. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const out: number[] = []
  let bits = 0
  let bitCount = 0
  let codeSize = minCodeSize + 1
  const emit = (code: number) => {
    bits |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      out.push(bits & 0xff)
      bits >>>= 8
      bitCount -= 8
    }
  }

  let table = new Map<number, number>()
  let nextCode = eoiCode + 1
  emit(clearCode)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const code = table.get(key)
    if (code !== undefined) {
      prefix = code
      continue
    }
    emit(prefix)
    if (nextCode === MAX_CODE) {
      // Table full: start over, as decoders expect
      emit(clearCode)
      table = new Map()
      nextCode = eoiCode + 1
      codeSize = minCodeSize + 1
    } else {
      if (nextCode >= 1 << codeSize) codeSize++
      table.set(key, nextCode++)
    }
    prefix = k
  }
  emit(prefix)
  emit(eoiCode)
  if (bitCount > 0) out.push(bits & 0xff)
  return Uint8Array.from(out)
}

class ByteWriter {
  bytes: number[] = []
  byte(...values: number[]) {
    this.bytes.push(...values)
  }
  u16(value: number) {
    this.bytes.push(value & 0xff, (value >> 8) & 0xff)
  }
  ascii(text: string) {
    for (const ch of text) this.bytes.push(ch.charCodeAt(0))
  }
  /** Data split into sub-blocks of at most 255 bytes, ended by an empty one. */
  subBlocks(data: Uint8Array) {
    for (let i = 0; i < data.length; i += 255) {
      const block = data.subarray(i, i + 255)
      this.bytes.push(block.length)
      for (const b of block) this.bytes.push(b)
    }
    this.bytes.push(0)
  }
}

/** An animated GIF that loops forever. Partly transparent pixels become fully opaque or fully transparent. */
export function encodeGif(frames: string[][][], width: number, height: number, options: GifOptions): Uint8Array {
  const scale = options.scale ?? 1
  const { indices, table, transparent } = indexFrames(frames, width, height)
  // Bits per index: the table size is a power of two, at least 2 entries
  let depth = 1
  while (1 << depth < table.length) depth++
  const outW = width * scale
  const outH = height * scale

  const w = new ByteWriter()
  w.ascii('GIF89a')
  w.u16(outW)
  w.u16(outH)
  w.byte(0x80 | ((depth - 1) << 4) | (depth - 1), 0, 0)
  for (let i = 0; i < 1 << depth; i++) w.byte(...(table[i] ?? [0, 0, 0]))

  // Loop forever (NETSCAPE2.0 extension)
  w.byte(0x21, 0xff, 11)
  w.ascii('NETSCAPE2.0')
  w.byte(3, 1)
  w.u16(0)
  w.byte(0)

  const delays = frameDelays(frames.length, options.fps)
  indices.forEach((frame, i) => {
    // Graphic control: clear to transparent before the next frame, so frames don't pile up
    w.byte(0x21, 0xf9, 4, (2 << 2) | (transparent ? 1 : 0))
    w.u16(delays[i])
    w.byte(0, 0)
    // Image descriptor covering the whole canvas, using the global color table
    w.byte(0x2c)
    w.u16(0)
    w.u16(0)
    w.u16(outW)
    w.u16(outH)
    w.byte(0)
    const minCodeSize = Math.max(2, depth)
    w.byte(minCodeSize)
    w.subBlocks(lzwEncode(scaleIndices(frame, width, height, scale), minCodeSize))
  })
  w.byte(0x3b)
  return Uint8Array.from(w.bytes)
}
