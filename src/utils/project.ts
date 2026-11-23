// The editor's own project file (.pxa): every frame, layer and setting, as JSON.
// Pixels are stored as indices into a color list, run-length encoded, since pixel art repeats a lot.
import type { EditorDocument } from '../hooks/useEditor'
import { TRANSPARENT, normalizeColor } from './color'
import { type FrameDuration, hasCustomDurations, normalizeDurations } from './timing'

export const PROJECT_EXTENSION = 'pxa'
const FORMAT = 'pixel-art-editor'
const VERSION = 1
/** Same limit as the canvas size control */
const MAX_SIDE = 256

interface ProjectFile {
  format: typeof FORMAT
  version: number
  width: number
  height: number
  fps: number
  /** Index 0 is always transparent */
  colors: string[]
  layers: { name: string; visible: boolean; opacity: number }[]
  /** frames[frame][layer]: [count, colorIndex, count, colorIndex, ...] row by row */
  frames: number[][][]
  /** Milliseconds per frame, null to follow fps. Left out when every frame follows fps (older files) */
  durations?: FrameDuration[]
}

export function serializeProject(doc: EditorDocument): string {
  const colors = [TRANSPARENT]
  const index = new Map([[TRANSPARENT, 0]])
  const indexOf = (color: string) => {
    let i = index.get(color)
    if (i === undefined) {
      i = colors.length
      colors.push(color)
      index.set(color, i)
    }
    return i
  }
  const encode = (pixels: string[][]) => {
    const runs: number[] = []
    let last = -1
    for (const row of pixels) {
      for (const color of row) {
        const i = indexOf(color)
        if (i === last) runs[runs.length - 2]++
        else runs.push(1, i)
        last = i
      }
    }
    return runs
  }
  const file: ProjectFile = {
    format: FORMAT,
    version: VERSION,
    width: doc.width,
    height: doc.height,
    fps: doc.fps ?? 8,
    colors,
    layers: doc.layers.map(({ name, visible, opacity }) => ({ name, visible, opacity })),
    frames: doc.cels.map(row => row.map(encode)),
  }
  if (doc.durations && hasCustomDurations(doc.durations)) file.durations = doc.durations
  return JSON.stringify(file)
}

const isSize = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_SIDE

/** Reads a project file. Throws an Error with a message for the user when the file is not a valid project. */
export function parseProject(text: string): EditorDocument {
  let data: Partial<ProjectFile>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a Pixel Art Editor project')
  }
  if (!data || data.format !== FORMAT) throw new Error('Not a Pixel Art Editor project')
  if (typeof data.version !== 'number' || data.version > VERSION) {
    throw new Error('This project was saved by a newer version of the editor')
  }
  const { width, height, colors, layers, frames } = data
  if (!isSize(width) || !isSize(height)) throw new Error('The project has an invalid canvas size')
  if (!Array.isArray(colors) || !Array.isArray(layers) || !Array.isArray(frames)) {
    throw new Error('The project file is damaged')
  }
  if (layers.length === 0 || frames.length === 0) throw new Error('The project has no layers or frames')

  // Unreadable colors become transparent rather than failing the whole file
  const palette = colors.map(c => normalizeColor(c) ?? TRANSPARENT)
  const size = width * height
  const decode = (runs: unknown): string[][] => {
    if (!Array.isArray(runs) || runs.length % 2 !== 0) throw new Error('The project file is damaged')
    const flat: string[] = []
    for (let i = 0; i < runs.length; i += 2) {
      const count = runs[i]
      const color = palette[runs[i + 1]]
      if (!Number.isInteger(count) || count < 1 || color === undefined || flat.length + count > size) {
        throw new Error('The project file is damaged')
      }
      for (let n = 0; n < count; n++) flat.push(color)
    }
    if (flat.length !== size) throw new Error('The project file is damaged')
    return Array.from({ length: height }, (_, y) => flat.slice(y * width, (y + 1) * width))
  }

  return {
    width,
    height,
    fps: Number.isFinite(data.fps) ? data.fps : undefined,
    durations: normalizeDurations(data.durations, frames.length),
    layers: layers.map((l, i) => ({
      name: typeof l?.name === 'string' && l.name.trim() ? l.name : `Layer ${i + 1}`,
      visible: l?.visible !== false,
      opacity: Number.isFinite(l?.opacity) ? Math.max(0, Math.min(1, l.opacity)) : 1,
    })),
    cels: frames.map(row => {
      if (!Array.isArray(row) || row.length !== layers.length) throw new Error('The project file is damaged')
      return row.map(decode)
    }),
  }
}
