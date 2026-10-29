import { useState, useCallback, useRef } from 'react'
import type { Tool, ShapeTool, PixelData, EditorState, Selection } from '../types'
import { linePoints, shapePoints } from '../utils/shapes'
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** The part of a selection that lies inside the canvas, or null if none of it does. */
function clampRegion(sel: Selection, width: number, height: number): Selection | null {
  const x0 = Math.max(0, sel.x)
  const y0 = Math.max(0, sel.y)
  const x1 = Math.min(width, sel.x + sel.width)
  const y1 = Math.min(height, sel.y + sel.height)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
}

function extractRegion(pixels: string[][], region: Selection): string[][] {
  return pixels.slice(region.y, region.y + region.height).map(row => row.slice(region.x, region.x + region.width))
}

function clearRegion(pixels: string[][], region: Selection): string[][] {
  const out = clonePixels(pixels)
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) out[y][x] = TRANSPARENT
  }
  return out
}

/** Copy of pixels with the opaque pixels of buffer drawn at (x, y); transparent ones leave what is below. */
function compositeOnto(pixels: string[][], buffer: string[][], x: number, y: number): string[][] {
  const out = clonePixels(pixels)
  for (let by = 0; by < buffer.length; by++) {
    for (let bx = 0; bx < buffer[by].length; bx++) {
      const color = buffer[by][bx]
      if (color !== TRANSPARENT) out[y + by][x + bx] = color
    }
  }
  return out
}

/** A selection being dragged: the canvas without it (unless copying) and the pixels it carries. */
interface FloatingSelection {
  base: PixelData
  buffer: string[][]
}

/**
 * Paints a size x size square brush centred on (cx, cy). With mirrorX / mirrorY the square is also painted
 * reflected across the canvas centre; the reflected square is computed from its edges so even sizes stay symmetric.
 */
function stampBrush(
  pixels: string[][],
  width: number,
  height: number,
  cx: number,
  cy: number,
  color: string,
  size: number,
  mirrorX = false,
  mirrorY = false,
) {
  const off = Math.floor((size - 1) / 2)
  const x0 = cx - off
  const y0 = cy - off
  const xs: [number, number][] = [[x0, x0 + size - 1]]
  const ys: [number, number][] = [[y0, y0 + size - 1]]
  if (mirrorX) xs.push([width - 1 - (x0 + size - 1), width - 1 - x0])
  if (mirrorY) ys.push([height - 1 - (y0 + size - 1), height - 1 - y0])
  for (const [ax, bx] of xs) {
    for (const [ay, by] of ys) {
      for (let y = Math.max(0, ay); y <= Math.min(height - 1, by); y++) {
        for (let x = Math.max(0, ax); x <= Math.min(width - 1, bx); x++) {
          pixels[y][x] = color
        }
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
    shapeFilled: false,
    mirrorX: false,
    mirrorY: false,
    selection: null,
  }))

  // Pixel data is never mutated in place, so history can hold the same objects as state.
  // The ref is updated synchronously so several events between renders see the latest pixels.
  const pixelDataRef = useRef(state.pixelData)
  // Read at call time so strokes already in progress follow the latest toggle
  const mirrorRef = useRef({ x: state.mirrorX, y: state.mirrorY })
  mirrorRef.current = { x: state.mirrorX, y: state.mirrorY }
  // Canvas as it was when the current shape drag started; the shape preview is redrawn on top of it
  const shapeBaseRef = useRef<PixelData | null>(null)
  const historyRef = useRef<PixelData[]>([state.pixelData])
  const historyIndexRef = useRef(0)
  // Selection that goes with each history entry, so undo and redo bring back the right one
  const selHistoryRef = useRef<(Selection | null)[]>([null])
  const [, setHistoryVersion] = useState(0)
  // Synchronous copy of state.selection, like pixelDataRef, for operations chained within one event
  const selectionRef = useRef<Selection | null>(null)
  const floatRef = useRef<FloatingSelection | null>(null)
  const clipboardRef = useRef<string[][] | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)

  const setPixelData = useCallback((pixelData: PixelData) => {
    const previous = pixelDataRef.current
    pixelDataRef.current = pixelData
    // A selection made on a canvas of another size would point outside the new one
    const sizeChanged = previous.width !== pixelData.width || previous.height !== pixelData.height
    if (sizeChanged) selectionRef.current = null
    setState(prev => ({ ...prev, pixelData, ...(sizeChanged ? { selection: null } : {}) }))
  }, [])

  /** Changes the selection without touching history: used while an operation is moving it. */
  const showSelection = useCallback((selection: Selection | null) => {
    selectionRef.current = selection
    setState(prev => ({ ...prev, selection }))
  }, [])

  /** A selection chosen by the user. Undo returns to it, so it is recorded with the current history entry. */
  const setSelection = useCallback(
    (selection: Selection | null) => {
      showSelection(selection)
      selHistoryRef.current[historyIndexRef.current] = selection
    },
    [showSelection],
  )

  /** Records the current pixels as one undo step (no-op if nothing changed). */
  const commitHistory = useCallback(() => {
    shapeBaseRef.current = null
    floatRef.current = null
    const current = pixelDataRef.current
    const idx = historyIndexRef.current
    if (historyRef.current[idx] === current) return
    historyRef.current = historyRef.current.slice(0, idx + 1)
    historyRef.current.push(current)
    selHistoryRef.current = selHistoryRef.current.slice(0, idx + 1)
    selHistoryRef.current.push(selectionRef.current)
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
      selHistoryRef.current.shift()
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

  const toggleShapeFilled = useCallback(() => {
    setState(prev => ({ ...prev, shapeFilled: !prev.shapeFilled }))
  }, [])

  const toggleMirrorX = useCallback(() => {
    setState(prev => ({ ...prev, mirrorX: !prev.mirrorX }))
  }, [])

  const toggleMirrorY = useCallback(() => {
    setState(prev => ({ ...prev, mirrorY: !prev.mirrorY }))
  }, [])

  /** Paints a brush line from (x0, y0) to (x1, y1). Part of a stroke: call commitHistory when it ends. */
  const paintLine = useCallback(
    (x0: number, y0: number, x1: number, y1: number, color: string, size: number) => {
      const { pixels, width, height } = pixelDataRef.current
      const newPixels = clonePixels(pixels)
      // A full line rather than single points, so fast pointer moves don't leave gaps
      for (const [x, y] of linePoints(x0, y0, x1, y1)) {
        stampBrush(newPixels, width, height, x, y, color, size, mirrorRef.current.x, mirrorRef.current.y)
      }
      setPixelData({ width, height, pixels: newPixels })
    },
    [setPixelData],
  )

  /** Marks the start of a shape drag so it can be redrawn from the same canvas on every pointer move. */
  const beginShape = useCallback(() => {
    shapeBaseRef.current = pixelDataRef.current
  }, [])

  /** Draws a shape preview from (x0, y0) to (x1, y1). Call commitHistory when the drag ends. */
  const drawShape = useCallback(
    (
      shape: ShapeTool,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      color: string,
      size: number,
      filled: boolean,
    ) => {
      const base = shapeBaseRef.current ?? pixelDataRef.current
      const pixels = clonePixels(base.pixels)
      // A filled shape is the exact area between the two corners, so the brush size only applies to outlines
      const brush = filled && shape !== 'line' ? 1 : size
      for (const [x, y] of shapePoints(shape, x0, y0, x1, y1, filled)) {
        stampBrush(pixels, base.width, base.height, x, y, color, brush, mirrorRef.current.x, mirrorRef.current.y)
      }
      setPixelData({ width: base.width, height: base.height, pixels })
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

  const getSelection = useCallback(() => selectionRef.current, [])

  const selectAll = useCallback(() => {
    const { width, height } = pixelDataRef.current
    setSelection({ x: 0, y: 0, width, height })
  }, [setSelection])

  /** Copies the selected pixels to the editor clipboard. Returns false if nothing is selected. */
  const copySelection = useCallback((): boolean => {
    const { pixels, width, height } = pixelDataRef.current
    const region = selectionRef.current && clampRegion(selectionRef.current, width, height)
    if (!region) return false
    clipboardRef.current = extractRegion(pixels, region)
    setHasClipboard(true)
    return true
  }, [])

  /** Makes the selected pixels transparent, as one undo step. Returns false if nothing is selected. */
  const deleteSelection = useCallback((): boolean => {
    const current = pixelDataRef.current
    const region = selectionRef.current && clampRegion(selectionRef.current, current.width, current.height)
    if (!region) return false
    setPixelData({ ...current, pixels: clearRegion(current.pixels, region) })
    commitHistory()
    return true
  }, [setPixelData, commitHistory])

  const cutSelection = useCallback(
    (): boolean => copySelection() && deleteSelection(),
    [copySelection, deleteSelection],
  )

  /**
   * Pastes the clipboard with its top-left corner at (x, y), kept inside the canvas, and selects it.
   * Returns false if the clipboard is empty.
   */
  const pasteClipboard = useCallback(
    (x: number, y: number): boolean => {
      const buffer = clipboardRef.current
      if (!buffer) return false
      const current = pixelDataRef.current
      const width = Math.min(buffer[0].length, current.width)
      const height = Math.min(buffer.length, current.height)
      const px = clamp(x, 0, current.width - width)
      const py = clamp(y, 0, current.height - height)
      const visible = buffer.slice(0, height).map(row => row.slice(0, width))
      setPixelData({ ...current, pixels: compositeOnto(current.pixels, visible, px, py) })
      showSelection({ x: px, y: py, width, height })
      commitHistory()
      return true
    },
    [setPixelData, commitHistory, showSelection],
  )

  /**
   * Starts dragging the selection: lifts its pixels off the canvas, or with copy leaves the original in place.
   * Follow with moveSelectionTo and finish with commitHistory. Returns false if nothing is selected.
   */
  const beginMove = useCallback(
    (copy: boolean): boolean => {
      const current = pixelDataRef.current
      const region = selectionRef.current && clampRegion(selectionRef.current, current.width, current.height)
      if (!region) return false
      floatRef.current = {
        base: copy ? current : { ...current, pixels: clearRegion(current.pixels, region) },
        buffer: extractRegion(current.pixels, region),
      }
      showSelection(region)
      return true
    },
    [showSelection],
  )

  /** Drops the dragged selection with its top-left corner at (x, y), kept inside the canvas. */
  const moveSelectionTo = useCallback(
    (x: number, y: number) => {
      const float = floatRef.current
      if (!float) return
      const { base, buffer } = float
      const width = buffer[0].length
      const height = buffer.length
      const nx = clamp(x, 0, base.width - width)
      const ny = clamp(y, 0, base.height - height)
      setPixelData({ ...base, pixels: compositeOnto(base.pixels, buffer, nx, ny) })
      const sel = selectionRef.current
      if (!sel || sel.x !== nx || sel.y !== ny) showSelection({ x: nx, y: ny, width, height })
    },
    [setPixelData, showSelection],
  )

  /** Moves the selected pixels by (dx, dy) as one undo step. Returns false if nothing is selected. */
  const nudgeSelection = useCallback(
    (dx: number, dy: number): boolean => {
      const sel = selectionRef.current
      if (!sel || !beginMove(false)) return false
      moveSelectionTo(sel.x + dx, sel.y + dy)
      commitHistory()
      return true
    },
    [beginMove, moveSelectionTo, commitHistory],
  )

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    floatRef.current = null
    setPixelData(historyRef.current[historyIndexRef.current])
    showSelection(selHistoryRef.current[historyIndexRef.current] ?? null)
    setHistoryVersion(v => v + 1)
  }, [setPixelData, showSelection])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    floatRef.current = null
    setPixelData(historyRef.current[historyIndexRef.current])
    showSelection(selHistoryRef.current[historyIndexRef.current] ?? null)
    setHistoryVersion(v => v + 1)
  }, [setPixelData, showSelection])

  const importPixels = useCallback((pixels: string[][], width: number, height: number) => {
    const pixelData = { width, height, pixels }
    pixelDataRef.current = pixelData
    historyRef.current = [pixelData]
    selHistoryRef.current = [null]
    historyIndexRef.current = 0
    floatRef.current = null
    selectionRef.current = null
    setHistoryVersion(v => v + 1)
    setState(prev => ({
      ...prev,
      pixelData,
      selection: null,
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
    toggleShapeFilled,
    toggleMirrorX,
    toggleMirrorY,
    paintLine,
    beginShape,
    drawShape,
    fillRegion,
    shadePixel,
    commitHistory,
    pickColor,
    resizeCanvas,
    clearCanvas,
    applyPixels,
    importPixels,
    hasClipboard,
    getSelection,
    setSelection,
    selectAll,
    copySelection,
    cutSelection,
    deleteSelection,
    pasteClipboard,
    beginMove,
    moveSelectionTo,
    nudgeSelection,
    undo,
    redo,
  }
}
