import { useState, useCallback, useRef } from 'react'
import type { Tool, PixelData, EditorState } from '../types'
import { TRANSPARENT, formatColor, normalizeColor, parseColor, toHex } from '../utils/color'

const MAX_HISTORY = 100

function createEmptyPixelData(width: number, height: number): PixelData {
  const pixels: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      row.push(TRANSPARENT)
    }
    pixels.push(row)
  }
  return { width, height, pixels }
}

function clonePixels(pixels: string[][]): string[][] {
  return pixels.map(row => [...row])
}

function stampBrush(
  pixels: string[][],
  width: number,
  height: number,
  cx: number,
  cy: number,
  color: string,
  size: number,
) {
  const off = Math.floor((size - 1) / 2)
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = cx - off + dx
      const py = cy - off + dy
      if (px >= 0 && px < width && py >= 0 && py < height) {
        pixels[py][px] = color
      }
    }
  }
}

const DEFAULT_WIDTH = 32
const DEFAULT_HEIGHT = 32

export function useEditor() {
  const [state, setState] = useState<EditorState>(() => ({
    pixelData: createEmptyPixelData(DEFAULT_WIDTH, DEFAULT_HEIGHT),
    activeTool: 'pencil',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    zoom: 16,
    brushSize: 1,
    showGrid: true,
  }))

  // Pixel data is never mutated in place, so history can hold the same objects as state.
  // The ref is updated synchronously so several events between renders see the latest pixels.
  const pixelDataRef = useRef(state.pixelData)
  const historyRef = useRef<PixelData[]>([state.pixelData])
  const historyIndexRef = useRef(0)
  const [, setHistoryVersion] = useState(0)

  const setPixelData = useCallback((pixelData: PixelData) => {
    pixelDataRef.current = pixelData
    setState(prev => ({ ...prev, pixelData }))
  }, [])

  /** Records the current pixels as one undo step (no-op if nothing changed). */
  const commitHistory = useCallback(() => {
    const current = pixelDataRef.current
    const idx = historyIndexRef.current
    if (historyRef.current[idx] === current) return
    historyRef.current = historyRef.current.slice(0, idx + 1)
    historyRef.current.push(current)
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
    }
    historyIndexRef.current = historyRef.current.length - 1
    setHistoryVersion(v => v + 1)
  }, [])

  const setTool = useCallback((tool: Tool) => {
    setState(prev => ({ ...prev, activeTool: tool }))
  }, [])

  const setPrimaryColor = useCallback((color: string) => {
    setState(prev => ({ ...prev, primaryColor: color }))
  }, [])

  const setSecondaryColor = useCallback((color: string) => {
    setState(prev => ({ ...prev, secondaryColor: color }))
  }, [])

  const swapColors = useCallback(() => {
    setState(prev => ({ ...prev, primaryColor: prev.secondaryColor, secondaryColor: prev.primaryColor }))
  }, [])

  const setZoom = useCallback((zoom: number) => {
    setState(prev => {
      const maxSafe = Math.floor(16384 / Math.max(prev.pixelData.width, prev.pixelData.height))
      return { ...prev, zoom: Math.max(1, Math.min(maxSafe, zoom)) }
    })
  }, [])

  const setBrushSize = useCallback((size: number) => {
    setState(prev => ({ ...prev, brushSize: Math.max(1, Math.min(16, size)) }))
  }, [])

  const toggleGrid = useCallback(() => {
    setState(prev => ({ ...prev, showGrid: !prev.showGrid }))
  }, [])

  /** Paints a brush line from (x0, y0) to (x1, y1). Part of a stroke: call commitHistory when it ends. */
  const paintLine = useCallback(
    (x0: number, y0: number, x1: number, y1: number, color: string, size: number) => {
      const { pixels, width, height } = pixelDataRef.current
      const newPixels = clonePixels(pixels)
      // Bresenham, so fast pointer moves don't leave gaps
      const dx = Math.abs(x1 - x0)
      const dy = -Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : -1
      const sy = y0 < y1 ? 1 : -1
      let err = dx + dy
      let x = x0
      let y = y0
      for (;;) {
        stampBrush(newPixels, width, height, x, y, color, size)
        if (x === x1 && y === y1) break
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x += sx
        }
        if (e2 <= dx) {
          err += dx
          y += sy
        }
      }
      setPixelData({ width, height, pixels: newPixels })
    },
    [setPixelData],
  )

  const fillRegion = useCallback(
    (startX: number, startY: number, fillColor: string) => {
      const { pixels: oldPixels, width, height } = pixelDataRef.current
      const targetColor = oldPixels[startY]?.[startX]
      if (targetColor === undefined || targetColor === fillColor) return

      const pixels = clonePixels(oldPixels)
      const stack: [number, number][] = [[startX, startY]]
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue
        if (pixels[cy][cx] !== targetColor) continue

        pixels[cy][cx] = fillColor

        stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1])
      }

      setPixelData({ width, height, pixels })
      commitHistory()
    },
    [setPixelData, commitHistory],
  )

  /** Returns the pixel color as #rrggbb, or null for transparent pixels. */
  const pickColor = useCallback((x: number, y: number): string | null => {
    const c = parseColor(pixelDataRef.current.pixels[y]?.[x])
    if (!c || c[3] === 0) return null
    return toHex(c)
  }, [])

  /** Blends a pixel with its neighbours. Part of a stroke: call commitHistory when it ends. */
  const shadePixel = useCallback(
    (x: number, y: number) => {
      const { pixels, width, height } = pixelDataRef.current
      if (x < 0 || x >= width || y < 0 || y >= height) return

      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const [cr, cg, cb, ca] = parseColor(pixels[ny][nx]) ?? [0, 0, 0, 0]
          // Weight by alpha so transparent neighbours don't darken the result
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
          count++
        }
      }
      const blended =
        a === 0
          ? TRANSPARENT
          : formatColor([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / count)])
      if (blended === pixels[y][x]) return

      const newPixels = clonePixels(pixels)
      newPixels[y][x] = blended
      setPixelData({ width, height, pixels: newPixels })
    },
    [setPixelData],
  )

  const resizeCanvas = useCallback(
    (newWidth: number, newHeight: number) => {
      const old = pixelDataRef.current
      if (newWidth === old.width && newHeight === old.height) return
      const pixels: string[][] = []
      for (let y = 0; y < newHeight; y++) {
        const row: string[] = []
        for (let x = 0; x < newWidth; x++) {
          row.push(old.pixels[y]?.[x] ?? TRANSPARENT)
        }
        pixels.push(row)
      }
      setPixelData({ width: newWidth, height: newHeight, pixels })
      commitHistory()
    },
    [setPixelData, commitHistory],
  )

  const clearCanvas = useCallback(() => {
    const { width, height } = pixelDataRef.current
    setPixelData(createEmptyPixelData(width, height))
    commitHistory()
  }, [setPixelData, commitHistory])

  /**
   * Writes an AI result into the canvas at (offsetX, offsetY), limited to width x height.
   * Missing or invalid colors keep the existing pixel. Returns how many pixels were applied.
   */
  const applyPixels = useCallback(
    (source: string[][], offsetX: number, offsetY: number, width: number, height: number): number => {
      const current = pixelDataRef.current
      const pixels = clonePixels(current.pixels)
      let applied = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const color = normalizeColor(source[y]?.[x])
          const tx = offsetX + x
          const ty = offsetY + y
          if (color === null || tx >= current.width || ty >= current.height) continue
          pixels[ty][tx] = color
          applied++
        }
      }
      if (applied > 0) {
        setPixelData({ ...current, pixels })
        commitHistory()
      }
      return applied
    },
    [setPixelData, commitHistory],
  )

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    setPixelData(historyRef.current[historyIndexRef.current])
    setHistoryVersion(v => v + 1)
  }, [setPixelData])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    setPixelData(historyRef.current[historyIndexRef.current])
    setHistoryVersion(v => v + 1)
  }, [setPixelData])

  const importPixels = useCallback((pixels: string[][], width: number, height: number) => {
    const pixelData = { width, height, pixels }
    pixelDataRef.current = pixelData
    historyRef.current = [pixelData]
    historyIndexRef.current = 0
    setHistoryVersion(v => v + 1)
    setState(prev => ({
      ...prev,
      pixelData,
      zoom: Math.max(1, Math.floor(1024 / Math.max(width, height))),
    }))
  }, [])

  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1

  return {
    state,
    canUndo,
    canRedo,
    setTool,
    setPrimaryColor,
    setSecondaryColor,
    swapColors,
    setZoom,
    setBrushSize,
    toggleGrid,
    paintLine,
    fillRegion,
    shadePixel,
    commitHistory,
    pickColor,
    resizeCanvas,
    clearCanvas,
    applyPixels,
    importPixels,
    undo,
    redo,
  }
}
