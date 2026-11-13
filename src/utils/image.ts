import type { PixelData } from '../types'
import { formatColor } from './color'
import { countColors } from './pixelate'

/** Images up to this size with up to this many colors open as they are; anything else gets the conversion dialog. */
const MAX_DIRECT_SIZE = 128
const MAX_DIRECT_COLORS = 256

export function loadImageFile(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, img.width, img.height))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

export function imageDataToPixels(imageData: ImageData): PixelData {
  const { width, height, data } = imageData
  const pixels: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      row.push(formatColor([data[i], data[i + 1], data[i + 2], data[i + 3]]))
    }
    pixels.push(row)
  }
  return { width, height, pixels }
}

/** Photos and large images get the conversion dialog; small sprites with few colors open as they are. */
export function needsConversion(imageData: ImageData): boolean {
  return (
    Math.max(imageData.width, imageData.height) > MAX_DIRECT_SIZE ||
    countColors(imageData, MAX_DIRECT_COLORS) > MAX_DIRECT_COLORS
  )
}

/** File name without folders or extension, from a Windows or POSIX path. */
export function fileBaseName(path: string, fallback = 'untitled'): string {
  return (
    path
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^/.]+$/, '') || fallback
  )
}

/** The path with the extension added when the save dialog returned it without one. */
export function withExtension(path: string, ext: string): string {
  return path.toLowerCase().endsWith(`.${ext}`) ? path : `${path}.${ext}`
}
