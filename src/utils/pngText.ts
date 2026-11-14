// Reading and writing PNG tEXt chunks, used to keep the animation data inside a saved PNG.
// Any image viewer ignores them, so the file still opens everywhere as a sprite sheet.

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

let crcTable: Uint32Array | null = null

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && SIGNATURE.every((b, i) => bytes[i] === b)
}

/** Chunks as [type, offset of the data, data length], in file order. */
function* chunks(bytes: Uint8Array): Generator<[string, number, number]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 8
  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos)
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8))
    if (pos + 12 + length > bytes.length) return
    yield [type, pos + 8, length]
    pos += 12 + length
  }
}

/** A copy of the PNG with a tEXt chunk right after the header. Keyword and text must be Latin-1. */
export function addPngText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(png)) throw new Error('Not a PNG file')
  const data = new TextEncoder().encode(`${keyword}\0${text}`)
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set([116, 69, 88, 116], 4) // "tEXt"
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))

  // IHDR is always the first chunk: 8 signature bytes, then 4 length + 4 type + 13 data + 4 CRC
  const afterHeader = 8 + 25
  const out = new Uint8Array(png.length + chunk.length)
  out.set(png.subarray(0, afterHeader))
  out.set(chunk, afterHeader)
  out.set(png.subarray(afterHeader), afterHeader + chunk.length)
  return out
}

/** The text of the first tEXt chunk with that keyword, or null. */
export function readPngText(png: Uint8Array, keyword: string): string | null {
  if (!isPng(png)) return null
  for (const [type, offset, length] of chunks(png)) {
    if (type === 'IEND') break
    if (type !== 'tEXt') continue
    const data = png.subarray(offset, offset + length)
    const sep = data.indexOf(0)
    if (sep < 0 || new TextDecoder('latin1').decode(data.subarray(0, sep)) !== keyword) continue
    return new TextDecoder('latin1').decode(data.subarray(sep + 1))
  }
  return null
}

export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  // In slices: spreading a whole large image into String.fromCharCode would overflow the stack
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
