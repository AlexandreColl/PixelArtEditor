export const EXPORT_SCALES = [1, 2, 4, 8]

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
