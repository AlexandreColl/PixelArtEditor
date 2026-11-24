export type ShapeTool = 'line' | 'rect' | 'ellipse'
export type Tool =
  'pencil' | 'eraser' | 'fill' | 'picker' | 'selection' | 'wand' | 'lasso' | 'move' | 'shade' | ShapeTool

export interface PixelData {
  width: number
  height: number
  pixels: string[][]
}

export interface Selection {
  x: number
  y: number
  width: number
  height: number
  /** mask[y][x], relative to the corner: which pixels are selected. Without it, all of the rectangle */
  mask?: boolean[][]
}

/** A layer of the animation; every frame has one cel (PixelData) per layer. */
export interface Layer {
  /** Stable key for lists; not saved */
  id: number
  name: string
  visible: boolean
  /** 0–1 */
  opacity: number
}

/** The swatches in the color panel */
export interface Palette {
  name: string
  colors: string[]
}

export interface EditorState {
  /** The cel being edited: cels[currentFrame][currentLayer] */
  pixelData: PixelData
  /** cels[frame][layer]: the pixels of every layer in every frame, all the same size */
  cels: PixelData[][]
  /** Bottom first, in the order they are drawn */
  layers: Layer[]
  currentFrame: number
  currentLayer: number
  /** Animation speed, in frames per second */
  fps: number
  /** durations[frame]: milliseconds, or null to follow fps */
  durations: (number | null)[]
  /** Shows the previous frame faintly under the current one */
  onionSkin: boolean
  activeTool: Tool
  primaryColor: string
  secondaryColor: string
  zoom: number
  brushSize: number
  showGrid: boolean
  shapeFilled: boolean
  mirrorX: boolean
  mirrorY: boolean
  selection: Selection | null
}
