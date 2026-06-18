export type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'selection' | 'shade'

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

export interface EditorState {
  pixelData: PixelData
  activeTool: Tool
  primaryColor: string
  secondaryColor: string
  zoom: number
  brushSize: number
}
