import { TRANSPARENT, parseColor } from './color'

export const EXPORT_SCALES = [1, 2, 4, 8]

/** Draws the pixels onto the canvas at one canvas pixel each, resizing the canvas to fit. */
export function drawPixels(canvas: HTMLCanvasElement, pixels: string[][], width: number, height: number) {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = parseColor(pixels[y]?.[x] ?? TRANSPARENT) ?? [0, 0, 0, 0]
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
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
