import { TRANSPARENT } from './color'

/** Keyword of the PNG text chunk where a saved animation records how its sheet is laid out. */
export const ANIMATION_KEY = 'pixel-art-editor'

export interface AnimationInfo {
  frames: number
  frameWidth: number
  frameHeight: number
  /** Frames per row of the sheet */
  columns: number
  fps: number
}

/** All the frames in one image, left to right and then top to bottom, `columns` per row. */
export function framesToSheet(frames: string[][][], width: number, height: number, columns = frames.length) {
  const cols = Math.max(1, Math.min(columns, frames.length))
  const rows = Math.ceil(frames.length / cols)
  const pixels: string[][] = Array.from({ length: rows * height }, () => Array(cols * width).fill(TRANSPARENT))
  frames.forEach((frame, i) => {
    const ox = (i % cols) * width
    const oy = Math.floor(i / cols) * height
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) pixels[oy + y][ox + x] = frame[y][x]
    }
  })
  return { pixels, width: cols * width, height: rows * height }
}

const isEmpty = (frame: string[][]) => frame.every(row => row.every(c => c === TRANSPARENT))

/**
 * Cuts a sheet into frameWidth x frameHeight frames, left to right and then top to bottom.
 * Cells that do not fit whole are left out, and so are empty cells at the end of the last row.
 * Up to `count` frames when given.
 */
export function sheetToFrames(
  sheet: string[][],
  sheetWidth: number,
  sheetHeight: number,
  frameWidth: number,
  frameHeight: number,
  count?: number,
): string[][][] {
  const cols = Math.floor(sheetWidth / frameWidth)
  const rows = Math.floor(sheetHeight / frameHeight)
  const frames: string[][][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      frames.push(
        sheet.slice(r * frameHeight, (r + 1) * frameHeight).map(row => row.slice(c * frameWidth, (c + 1) * frameWidth)),
      )
    }
  }
  if (count !== undefined) return frames.slice(0, count)
  while (frames.length > 1 && isEmpty(frames[frames.length - 1])) frames.pop()
  return frames
}

export function serializeAnimationInfo(info: AnimationInfo): string {
  return JSON.stringify({ version: 1, ...info })
}

/** The layout recorded in a saved PNG, or null if it is missing or does not match the image size. */
export function parseAnimationInfo(text: string | null, imageWidth: number, imageHeight: number): AnimationInfo | null {
  if (!text) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const ints = ['frames', 'frameWidth', 'frameHeight', 'columns', 'fps'] as const
  if (!data || typeof data !== 'object' || ints.some(k => !Number.isInteger(data[k]) || (data[k] as number) < 1)) {
    return null
  }
  const info = Object.fromEntries(ints.map(k => [k, data[k]])) as unknown as AnimationInfo
  const rows = Math.ceil(info.frames / info.columns)
  if (info.columns * info.frameWidth !== imageWidth || rows * info.frameHeight !== imageHeight) return null
  return info
}
