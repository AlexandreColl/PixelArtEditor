import { useState, useCallback, useRef } from 'react'
import type { Tool, PixelData, EditorState } from '../types'

const MAX_HISTORY = 100

function createEmptyPixelData(width: number, height: number): PixelData {
  const pixels: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      row.push('rgba(0,0,0,0)')
    }
    pixels.push(row)
  }
  return { width, height, pixels }
}

function clonePixels(pixels: string[][]): string[][] {
  return pixels.map(row => [...row])
}

const DEFAULT_WIDTH = 32
const DEFAULT_HEIGHT = 32

export function useEditor() {
  const [state, setState] = useState<EditorState>({
    pixelData: createEmptyPixelData(DEFAULT_WIDTH, DEFAULT_HEIGHT),
    activeTool: 'pencil',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    zoom: 16,
    brushSize: 1,
  })

  const historyRef = useRef([clonePixels(state.pixelData.pixels)])
  const historyIndexRef = useRef(0)

  const pushHistory = useCallback((pixels: string[][]) => {
    const idx = historyIndexRef.current
    historyRef.current = historyRef.current.slice(0, idx + 1)
    historyRef.current.push(clonePixels(pixels))
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
    }
    historyIndexRef.current = historyRef.current.length - 1
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

  const setZoom = useCallback((zoom: number) => {
    setState(prev => {
      const maxSafe = Math.floor(8192 / Math.max(prev.pixelData.width, prev.pixelData.height))
      return { ...prev, zoom: Math.max(2, Math.min(maxSafe, zoom)) }
    })
  }, [])

  const setBrushSize = useCallback((size: number) => {
    setState(prev => ({ ...prev, brushSize: Math.max(1, Math.min(16, size)) }))
  }, [])

  const paintPixel = useCallback(
    (x: number, y: number, color: string) => {
      setState(prev => {
        const pixels = clonePixels(prev.pixelData.pixels)
        if (y >= 0 && y < pixels.length && x >= 0 && x < pixels[0].length) {
          pixels[y][x] = color
        }
        pushHistory(pixels)
        return {
          ...prev,
          pixelData: { ...prev.pixelData, pixels },
        }
      })
    },
    [pushHistory],
  )

  const paintBrush = useCallback(
    (cx: number, cy: number, color: string, size: number) => {
      setState(prev => {
        const { pixels, width, height } = prev.pixelData
        const newPixels = clonePixels(pixels)
        const off = Math.floor((size - 1) / 2)
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const px = cx - off + dx
            const py = cy - off + dy
            if (px >= 0 && px < width && py >= 0 && py < height) {
              newPixels[py][px] = color
            }
          }
        }
        pushHistory(newPixels)
        return { ...prev, pixelData: { ...prev.pixelData, pixels: newPixels } }
      })
    },
    [pushHistory],
  )

  const fillRegion = useCallback(
    (startX: number, startY: number, fillColor: string) => {
      setState(prev => {
        const { pixels: oldPixels, width, height } = prev.pixelData
        const targetColor = oldPixels[startY]?.[startX]
        if (!targetColor || targetColor === fillColor) return prev

        const pixels = clonePixels(oldPixels)
        const visited = new Set<number>()

        const stack: [number, number][] = [[startX, startY]]
        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!
          const key = cy * width + cx
          if (visited.has(key)) continue
          visited.add(key)

          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue
          if (pixels[cy][cx] !== targetColor) continue

          pixels[cy][cx] = fillColor

          stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1])
        }

        pushHistory(pixels)
        return { ...prev, pixelData: { ...prev.pixelData, pixels } }
      })
    },
    [pushHistory],
  )

  const pickColor = useCallback(
    (x: number, y: number): string | null => {
      return state.pixelData.pixels[y]?.[x] ?? null
    },
    [state.pixelData.pixels],
  )

  const shadePixel = useCallback(
    (x: number, y: number) => {
      setState(prev => {
        const { pixels, width, height } = prev.pixelData
        const newPixels = clonePixels(pixels)

        const rgba = (s: string): [number, number, number, number] => {
          const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
          if (!m) return [0, 0, 0, 0]
          return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1]
        }

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
            const [cr, cg, cb, ca] = rgba(newPixels[ny][nx])
            r += cr
            g += cg
            b += cb
            a += ca
            count++
          }
        }
        if (count > 0) {
          const avg = `rgba(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)},${a / count})`
          newPixels[y][x] = avg
        }

        pushHistory(newPixels)
        return { ...prev, pixelData: { ...prev.pixelData, pixels: newPixels } }
      })
    },
    [pushHistory],
  )

  const resizeCanvas = useCallback(
    (newWidth: number, newHeight: number) => {
      setState(prev => {
        const pixels: string[][] = []
        for (let y = 0; y < newHeight; y++) {
          const row: string[] = []
          for (let x = 0; x < newWidth; x++) {
            row.push(prev.pixelData.pixels[y]?.[x] ?? 'rgba(0,0,0,0)')
          }
          pixels.push(row)
        }
        pushHistory(pixels)
        return {
          ...prev,
          pixelData: { width: newWidth, height: newHeight, pixels },
        }
      })
    },
    [pushHistory],
  )

  const clearCanvas = useCallback(() => {
    setState(prev => {
      const pixels = createEmptyPixelData(prev.pixelData.width, prev.pixelData.height).pixels
      pushHistory(pixels)
      return {
        ...prev,
        pixelData: { width: prev.pixelData.width, height: prev.pixelData.height, pixels },
      }
    })
  }, [pushHistory])

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    const pixels = clonePixels(historyRef.current[historyIndexRef.current])
    setState(prev => ({
      ...prev,
      pixelData: {
        ...prev.pixelData,
        pixels,
      },
    }))
  }, [])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    const pixels = clonePixels(historyRef.current[historyIndexRef.current])
    setState(prev => ({
      ...prev,
      pixelData: {
        ...prev.pixelData,
        pixels,
      },
    }))
  }, [])

  const importPixels = useCallback((pixels: string[][], width: number, height: number) => {
    historyRef.current = [clonePixels(pixels)]
    historyIndexRef.current = 0
    setState(prev => ({
      ...prev,
      pixelData: { width, height, pixels },
      zoom: Math.max(2, Math.min(64, Math.floor(512 / Math.max(width, height)))),
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
    setZoom,
    setBrushSize,
    paintPixel,
    paintBrush,
    fillRegion,
    shadePixel,
    pickColor,
    resizeCanvas,
    clearCanvas,
    importPixels,
    undo,
    redo,
  }
}
