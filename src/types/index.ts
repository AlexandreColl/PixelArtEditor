export type ShapeTool = 'line' | 'rect' | 'ellipse'
export type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'selection' | 'shade' | ShapeTool

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
}

/** The swatches in the color panel */
export interface Palette {
  name: string
  colors: string[]
}

export interface EditorState {
  /** The frame being edited; always frames[currentFrame] */
  pixelData: PixelData
  /** Every frame of the animation, all the same size */
  frames: PixelData[]
  currentFrame: number
  /** Animation speed, in frames per second */
  fps: number
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
