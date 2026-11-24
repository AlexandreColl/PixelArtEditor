import { TRANSPARENT, parseColorCached } from './color'

export const EXPORT_SCALES = [1, 2, 4, 8]

/** Draws the pixels onto the canvas at one canvas pixel each, resizing the canvas to fit. */
/**
 * The RGBA bytes of each row of pixels. Rows are never changed in place (an edit copies the rows
 * it touches), so a row that is still the same array still has the same bytes: redrawing a cel
 * after a brush stroke only converts the rows the stroke went through.
 */
const rowBytes = new WeakMap<string[], Uint8ClampedArray>()

export function pixelRowBytes(row: string[] | undefined, width: number): Uint8ClampedArray {
  const hit = row && rowBytes.get(row)
  if (hit && hit.length === width * 4) return hit
  const bytes = new Uint8ClampedArray(width * 4)
  for (let x = 0; x < width; x++) {
    const c = parseColorCached(row?.[x] ?? TRANSPARENT)
    bytes[x * 4] = c[0]
    bytes[x * 4 + 1] = c[1]
    bytes[x * 4 + 2] = c[2]
    bytes[x * 4 + 3] = c[3]
  }
  if (row) rowBytes.set(row, bytes)
  return bytes
}

export function drawPixels(canvas: HTMLCanvasElement, pixels: string[][], width: number, height: number) {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imageData = ctx.createImageData(width, height)
  for (let y = 0; y < height; y++) imageData.data.set(pixelRowBytes(pixels[y], width), y * width * 4)
  ctx.putImageData(imageData, 0, 0)
}

/** Renders pixels as a PNG data URL. Every pixel becomes a scale x scale block, with no smoothing. */
export function pixelsToPngDataUrl(pixels: string[][], width: number, height: number, scale = 1): string {
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ctx.fillStyle = pixels[y][x]
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
  return canvas.toDataURL('image/png')
}
