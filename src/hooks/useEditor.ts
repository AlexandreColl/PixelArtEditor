import { useState, useCallback, useRef } from 'react'
import { useLatest } from './useLatest'
import { type FrameDuration, cleanDuration, normalizeDurations } from '../utils/timing'
import type { Tool, ShapeTool, PixelData, EditorState, Layer, Selection } from '../types'
import { brushFootprints } from '../utils/brush'
import { linePoints, shapePoints } from '../utils/shapes'
import { TRANSPARENT, formatColor, normalizeColor, parseColor, toHex } from '../utils/color'
import { blendOver, flattenPixel } from '../utils/layers'

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

/** Paints the brush squares (see brushFootprints), mirrored when asked. */
/**
 * Stamps the brush into `pixels`, a shallow copy of `source` (its rows are shared until written).
 * A row is copied the first time it is written, so the rows a stroke does not touch stay the same
 * arrays, and what was rendered from them (textures, blended frames) is reused.
 */
function stampBrush(
  pixels: string[][],
  source: string[][],
  width: number,
  height: number,
  cx: number,
  cy: number,
  color: string,
  size: number,
  mirrorX = false,
  mirrorY = false,
) {
  for (const sq of brushFootprints(cx, cy, size, width, height, mirrorX, mirrorY)) {
    for (let y = sq.y; y < sq.y + sq.height; y++) {
      if (pixels[y] === source[y]) pixels[y] = [...source[y]]
      const row = pixels[y]
      for (let x = sq.x; x < sq.x + sq.width; x++) row[x] = color
    }
  }
}

const DEFAULT_WIDTH = 32
const DEFAULT_HEIGHT = 32
export const DEFAULT_FPS = 8
export const MAX_FPS = 60

let nextLayerId = 1

export function createLayer(name: string, props: Partial<Omit<Layer, 'id' | 'name'>> = {}): Layer {
  return { id: nextLayerId++, name, visible: true, opacity: 1, ...props }
}

/** A name like "Layer 3" that no layer has yet. */
function newLayerName(layers: Layer[]): string {
  const names = new Set(layers.map(l => l.name))
  let n = layers.length + 1
  while (names.has(`Layer ${n}`)) n++
  return `Layer ${n}`
}

/** One undo step: every cel and layer as they were, and where the change happened. */
interface Snapshot {
  cels: PixelData[][]
  layers: Layer[]
  durations: FrameDuration[]
  frame: number
  layer: number
  /** Where the change is once undone, when that is somewhere else (a moved frame or layer goes back) */
  before?: { frame?: number; layer?: number }
}

/** The whole document: what an opened project or file replaces. */
export interface EditorDocument {
  width: number
  height: number
  cels: string[][][][]
  layers: Omit<Layer, 'id'>[]
  fps?: number
  /** durations[frame] in milliseconds, or null to follow fps; missing means every frame follows fps */
  durations?: FrameDuration[]
}

export function useEditor() {
  const [state, setState] = useState<EditorState>(() => {
    const first = createEmptyPixelData(DEFAULT_WIDTH, DEFAULT_HEIGHT)
    return {
      pixelData: first,
      cels: [[first]],
      layers: [createLayer('Layer 1')],
      currentFrame: 0,
      currentLayer: 0,
      fps: DEFAULT_FPS,
      durations: [null],
      onionSkin: false,
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
    }
  })

  // Pixel data is never mutated in place, so history can hold the same objects as state,
  // and cels that did not change are shared between snapshots.
  // The refs are updated synchronously so several events between renders see the latest pixels.
  const celsRef = useRef(state.cels)
  const layersRef = useRef(state.layers)
  const durationsRef = useRef(state.durations)
  const frameIndexRef = useRef(0)
  const layerIndexRef = useRef(0)
  /** The cel being edited, celsRef.current[frameIndexRef.current][layerIndexRef.current] */
  const pixelDataRef = useRef(state.pixelData)
  // Read at call time so strokes already in progress follow the latest toggle
  const mirrorRef = useLatest({ x: state.mirrorX, y: state.mirrorY })
  // Canvas as it was when the current shape drag started; the shape preview is redrawn on top of it
  const shapeBaseRef = useRef<PixelData | null>(null)
  const [firstEntry] = useState<Snapshot>(() => ({
    cels: state.cels,
    layers: state.layers,
    durations: state.durations,
    frame: 0,
    layer: 0,
  }))
  const historyRef = useRef<Snapshot[]>([firstEntry])
  const historyIndexRef = useRef(0)
  // The history entry that matches the file on disk; any other entry means unsaved changes.
  // null when the document has never been saved (a recovered autosave).
  const savedEntryRef = useRef<Snapshot | null>(firstEntry)
  // Selection that goes with each history entry, so undo and redo bring back the right one
  const selHistoryRef = useRef<(Selection | null)[]>([null])
  // What the toolbar and status bar show about the history, refreshed whenever the refs above change
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false, isDirty: false })
  const syncHistory = useCallback(() => {
    const idx = historyIndexRef.current
    const next = {
      canUndo: idx > 0,
      canRedo: idx < historyRef.current.length - 1,
      // Undoing back to the saved entry counts as no changes
      isDirty: historyRef.current[idx] !== savedEntryRef.current,
    }
    setHistoryStatus(prev =>
      prev.canUndo === next.canUndo && prev.canRedo === next.canRedo && prev.isDirty === next.isDirty ? prev : next,
    )
  }, [])
  // Synchronous copy of state.selection, like pixelDataRef, for operations chained within one event
  const selectionRef = useRef<Selection | null>(null)
  const floatRef = useRef<FloatingSelection | null>(null)
  const clipboardRef = useRef<string[][] | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)

  /**
   * Replaces the cels and layers and picks the cel to edit. Not an undo step by itself: follow with commitHistory.
   * Indices out of range are clamped. Durations stay as they are unless given; they must match the frames.
   */
  const setDocument = useCallback(
    (
      cels: PixelData[][],
      layers: Layer[],
      frame = frameIndexRef.current,
      layer = layerIndexRef.current,
      durations = durationsRef.current,
    ) => {
      if (durations.length !== cels.length) durations = normalizeDurations(durations, cels.length)
      const previous = pixelDataRef.current
      const f = clamp(frame, 0, cels.length - 1)
      const l = clamp(layer, 0, layers.length - 1)
      const pixelData = cels[f][l]
      celsRef.current = cels
      layersRef.current = layers
      durationsRef.current = durations
      frameIndexRef.current = f
      layerIndexRef.current = l
      pixelDataRef.current = pixelData
      // A selection made on a canvas of another size would point outside the new one
      const sizeChanged = previous.width !== pixelData.width || previous.height !== pixelData.height
      if (sizeChanged) selectionRef.current = null
      setState(prev => ({
        ...prev,
        pixelData,
        cels,
        layers,
        durations,
        currentFrame: f,
        currentLayer: l,
        ...(sizeChanged ? { selection: null } : {}),
      }))
    },
    [],
  )

  /** Replaces the cels, keeping the layers. */
  const setCels = useCallback(
    (cels: PixelData[][], frame?: number, durations?: FrameDuration[]) =>
      setDocument(cels, layersRef.current, frame, undefined, durations),
    [setDocument],
  )

  /** Replaces the cel being edited. */
  const setPixelData = useCallback(
    (pixelData: PixelData) => {
      const cels = [...celsRef.current]
      const row = [...cels[frameIndexRef.current]]
      row[layerIndexRef.current] = pixelData
      cels[frameIndexRef.current] = row
      setCels(cels)
    },
    [setCels],
  )

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

  /**
   * Records the current cels and layers as one undo step (no-op if nothing changed).
   * `changedFrame` and `changedLayer` are what undo and redo show, by default the cel being edited.
   */
  const commitHistory = useCallback(
    (changedFrame?: number, changedLayer?: number, before?: Snapshot['before']) => {
      shapeBaseRef.current = null
      floatRef.current = null
      const cels = celsRef.current
      const layers = layersRef.current
      const durations = durationsRef.current
      const idx = historyIndexRef.current
      const last = historyRef.current[idx]
      if (last.cels === cels && last.layers === layers && last.durations === durations) return
      historyRef.current = historyRef.current.slice(0, idx + 1)
      historyRef.current.push({
        cels,
        layers,
        durations,
        frame: changedFrame ?? frameIndexRef.current,
        layer: changedLayer ?? layerIndexRef.current,
        before,
      })
      selHistoryRef.current = selHistoryRef.current.slice(0, idx + 1)
      selHistoryRef.current.push(selectionRef.current)
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current.shift()
        selHistoryRef.current.shift()
      }
      historyIndexRef.current = historyRef.current.length - 1
      syncHistory()
    },
    [syncHistory],
  )

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
      const newPixels = [...pixels]
      // A full line rather than single points, so fast pointer moves don't leave gaps
      for (const [x, y] of linePoints(x0, y0, x1, y1)) {
        stampBrush(newPixels, pixels, width, height, x, y, color, size, mirrorRef.current.x, mirrorRef.current.y)
      }
      setPixelData({ width, height, pixels: newPixels })
    },
    [setPixelData, mirrorRef],
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
      const pixels = [...base.pixels]
      // A filled shape is the exact area between the two corners, so the brush size only applies to outlines
      const brush = filled && shape !== 'line' ? 1 : size
      for (const [x, y] of shapePoints(shape, x0, y0, x1, y1, filled)) {
        stampBrush(
          pixels,
          base.pixels,
          base.width,
          base.height,
          x,
          y,
          color,
          brush,
          mirrorRef.current.x,
          mirrorRef.current.y,
        )
      }
      setPixelData({ width: base.width, height: base.height, pixels })
    },
    [setPixelData, mirrorRef],
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

  /** Returns the color shown at the pixel, every visible layer blended, as #rrggbb; null where transparent. */
  const pickColor = useCallback((x: number, y: number): string | null => {
    const c = parseColor(flattenPixel(celsRef.current[frameIndexRef.current], layersRef.current, x, y))
    if (!c || c[3] === 0) return null
    return toHex(c)
  }, [])

  /**
   * Blends a pixel with its neighbours; with snap the blend is mapped to a palette color.
   * Part of a stroke: call commitHistory when it ends.
   */
  const shadePixel = useCallback(
    (x: number, y: number, snap?: (color: string) => string) => {
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
      const mixed =
        a === 0
          ? TRANSPARENT
          : formatColor([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / count)])
      const blended = snap ? snap(mixed) : mixed
      if (blended === pixels[y][x]) return

      const newPixels = clonePixels(pixels)
      newPixels[y][x] = blended
      setPixelData({ width, height, pixels: newPixels })
    },
    [setPixelData],
  )

  /** Resizes every cel, keeping the pixels from the top-left corner. */
  const resizeCanvas = useCallback(
    (newWidth: number, newHeight: number) => {
      const { width, height } = pixelDataRef.current
      if (newWidth === width && newHeight === height) return
      const resize = (old: PixelData): PixelData => ({
        width: newWidth,
        height: newHeight,
        pixels: Array.from({ length: newHeight }, (_row, y) =>
          Array.from({ length: newWidth }, (_cell, x) => old.pixels[y]?.[x] ?? TRANSPARENT),
        ),
      })
      setCels(celsRef.current.map(row => row.map(resize)))
      commitHistory()
    },
    [setCels, commitHistory],
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

  /**
   * Replaces every pixel with map(color), as one undo step: in the selection of the cel being edited,
   * or with nothing selected in every layer of every frame. Returns how many pixels changed.
   */
  const remapColors = useCallback(
    (map: (color: string) => string): number => {
      const { width, height } = pixelDataRef.current
      const selected = selectionRef.current && clampRegion(selectionRef.current, width, height)
      const region = selected ?? { x: 0, y: 0, width, height }
      let changed = 0
      const remap = (frame: PixelData): PixelData => {
        const before = changed
        const pixels = clonePixels(frame.pixels)
        for (let y = region.y; y < region.y + region.height; y++) {
          for (let x = region.x; x < region.x + region.width; x++) {
            const color = map(pixels[y][x])
            if (color === pixels[y][x]) continue
            pixels[y][x] = color
            changed++
          }
        }
        // Unchanged frames stay the same object, so history keeps sharing them
        return changed > before ? { ...frame, pixels } : frame
      }
      const fi = frameIndexRef.current
      const li = layerIndexRef.current
      const cels = celsRef.current.map((row, f) =>
        selected && f !== fi ? row : row.map((cel, l) => (selected && l !== li ? cel : remap(cel))),
      )
      if (changed > 0) {
        setCels(cels)
        commitHistory()
      }
      return changed
    },
    [setCels, commitHistory],
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

  /**
   * Shows the layer's pixels as they were when the move began, shifted by (dx, dy). What goes past
   * the edge comes back if the drag returns; it is cut when the move is committed.
   * Call beginShape first and commitHistory when the drag ends.
   */
  const shiftCel = useCallback(
    (dx: number, dy: number) => {
      const base = shapeBaseRef.current ?? pixelDataRef.current
      const { width, height } = base
      const empty = Array<string>(width).fill(TRANSPARENT)
      const pixels = Array.from({ length: height }, (_row, y) => {
        const src = base.pixels[y - dy]
        if (!src) return empty.slice()
        // A vertical move keeps whole rows, so what was rendered from them is reused
        if (dx === 0) return src
        return Array.from({ length: width }, (_cell, x) => src[x - dx] ?? TRANSPARENT)
      })
      setPixelData({ width, height, pixels })
    },
    [setPixelData],
  )

  /** Moves the whole layer by (dx, dy) as one undo step, for the arrow keys. */
  const nudgeCel = useCallback(
    (dx: number, dy: number) => {
      shapeBaseRef.current = pixelDataRef.current
      shiftCel(dx, dy)
      commitHistory()
    },
    [shiftCel, commitHistory],
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

  /**
   * Goes to history entry `to`, showing the cel that the step between them changed,
   * so undoing a change in another frame or layer brings it into view.
   */
  const restoreHistory = useCallback(
    (to: number, changedEntry: number) => {
      const undoing = to < historyIndexRef.current
      historyIndexRef.current = to
      floatRef.current = null
      shapeBaseRef.current = null
      const { cels, layers, durations } = historyRef.current[to]
      const changed = historyRef.current[changedEntry]
      const at = undoing ? { ...changed, ...changed.before } : changed
      setDocument(cels, layers, at.frame, at.layer, durations)
      showSelection(selHistoryRef.current[to] ?? null)
      syncHistory()
    },
    [setDocument, showSelection, syncHistory],
  )

  const undo = useCallback(() => {
    const idx = historyIndexRef.current
    if (idx > 0) restoreHistory(idx - 1, idx)
  }, [restoreHistory])

  const redo = useCallback(() => {
    const idx = historyIndexRef.current
    if (idx < historyRef.current.length - 1) restoreHistory(idx + 1, idx + 1)
  }, [restoreHistory])

  /** Switches the cel being edited. Not an undo step. */
  const selectCel = useCallback(
    (frame: number, layer: number) => {
      if (frame === frameIndexRef.current && layer === layerIndexRef.current) return
      if (frame < 0 || frame >= celsRef.current.length || layer < 0 || layer >= layersRef.current.length) return
      // A selection lifted for dragging belongs to the cel it was lifted from
      if (floatRef.current) return
      shapeBaseRef.current = null
      setDocument(celsRef.current, layersRef.current, frame, layer)
    },
    [setDocument],
  )

  const selectFrame = useCallback((index: number) => selectCel(index, layerIndexRef.current), [selectCel])
  const selectLayer = useCallback((index: number) => selectCel(frameIndexRef.current, index), [selectCel])

  /** Inserts a frame after the current one and selects it, as one undo step. Without cels, it is empty. */
  const insertFrame = useCallback(
    (row?: PixelData[], duration: FrameDuration = null) => {
      const { width, height } = pixelDataRef.current
      const at = frameIndexRef.current + 1
      const cels = [...celsRef.current]
      cels.splice(at, 0, row ?? layersRef.current.map(() => createEmptyPixelData(width, height)))
      const durations = [...durationsRef.current]
      durations.splice(at, 0, duration)
      setCels(cels, at, durations)
      commitHistory()
    },
    [setCels, commitHistory],
  )

  const addFrame = useCallback(() => insertFrame(), [insertFrame])

  // Cels are never mutated, so the copy can share them until either is painted. It keeps the duration too.
  const duplicateFrame = useCallback(
    () => insertFrame(celsRef.current[frameIndexRef.current], durationsRef.current[frameIndexRef.current]),
    [insertFrame],
  )

  /** Removes the current frame, as one undo step. Returns false when it is the only one. */
  const deleteFrame = useCallback((): boolean => {
    const cels = celsRef.current
    if (cels.length <= 1) return false
    const index = frameIndexRef.current
    setCels(
      cels.filter((_, i) => i !== index),
      Math.min(index, cels.length - 2),
      durationsRef.current.filter((_, i) => i !== index),
    )
    // Undoing the deletion shows the frame that comes back
    commitHistory(index)
    return true
  }, [setCels, commitHistory])

  /** Moves a frame to another position and selects it, as one undo step. */
  const moveFrame = useCallback(
    (from: number, to: number) => {
      const cels = [...celsRef.current]
      if (from === to || from < 0 || to < 0 || from >= cels.length || to >= cels.length) return
      const [moved] = cels.splice(from, 1)
      cels.splice(to, 0, moved)
      const durations = [...durationsRef.current]
      const [duration] = durations.splice(from, 1)
      durations.splice(to, 0, duration)
      setCels(cels, to, durations)
      // Undoing puts the frame back where it was, so show it there
      commitHistory(to, undefined, { frame: from })
    },
    [setCels, commitHistory],
  )

  /** Inserts a layer above the current one in every frame and selects it, as one undo step. */
  const insertLayer = useCallback(
    (layer: Layer, celFor: (row: PixelData[]) => PixelData) => {
      const at = layerIndexRef.current + 1
      const layers = [...layersRef.current]
      layers.splice(at, 0, layer)
      const cels = celsRef.current.map(row => {
        const next = [...row]
        next.splice(at, 0, celFor(row))
        return next
      })
      setDocument(cels, layers, frameIndexRef.current, at)
      commitHistory()
    },
    [setDocument, commitHistory],
  )

  const addLayer = useCallback(() => {
    const { width, height } = pixelDataRef.current
    insertLayer(createLayer(newLayerName(layersRef.current)), () => createEmptyPixelData(width, height))
  }, [insertLayer])

  const duplicateLayer = useCallback(() => {
    const li = layerIndexRef.current
    const { name, visible, opacity } = layersRef.current[li]
    insertLayer(createLayer(`${name} copy`, { visible, opacity }), row => row[li])
  }, [insertLayer])

  /** Removes the current layer from every frame, as one undo step. Returns false when it is the only one. */
  const deleteLayer = useCallback((): boolean => {
    const layers = layersRef.current
    if (layers.length <= 1) return false
    const li = layerIndexRef.current
    setDocument(
      celsRef.current.map(row => row.filter((_, i) => i !== li)),
      layers.filter((_, i) => i !== li),
      frameIndexRef.current,
      Math.min(li, layers.length - 2),
    )
    commitHistory(undefined, li)
    return true
  }, [setDocument, commitHistory])

  /** Moves a layer up or down the stack and selects it, as one undo step. */
  const moveLayer = useCallback(
    (from: number, to: number) => {
      const count = layersRef.current.length
      if (from === to || from < 0 || to < 0 || from >= count || to >= count) return
      const move = <T>(list: T[]) => {
        const next = [...list]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      }
      setDocument(celsRef.current.map(move), move(layersRef.current), frameIndexRef.current, to)
      commitHistory(undefined, to, { layer: from })
    },
    [setDocument, commitHistory],
  )

  /**
   * Blends the current layer into the one below it in every frame, as one undo step.
   * Hidden layers merge too, at their opacity. Returns false for the bottom layer.
   */
  const mergeLayerDown = useCallback((): boolean => {
    const li = layerIndexRef.current
    if (li === 0) return false
    const { opacity } = layersRef.current[li]
    const cels = celsRef.current.map(row => {
      const top = row[li]
      const below = row[li - 1]
      const pixels = below.pixels.map((line, y) =>
        line.map((color, x) => {
          const t = parseColor(top.pixels[y][x])
          if (!t || t[3] === 0) return color
          return formatColor(blendOver(parseColor(color) ?? [0, 0, 0, 0], t, opacity))
        }),
      )
      return row.filter((_, i) => i !== li).map((cel, i) => (i === li - 1 ? { ...below, pixels } : cel))
    })
    setDocument(
      cels,
      layersRef.current.filter((_, i) => i !== li),
      frameIndexRef.current,
      li - 1,
    )
    commitHistory(undefined, li)
    return true
  }, [setDocument, commitHistory])

  /** Changes a layer's name, visibility or opacity. With commit (the default) it is an undo step. */
  const updateLayer = useCallback(
    (index: number, changes: Partial<Omit<Layer, 'id'>>, commit = true) => {
      const layers = layersRef.current
      if (!layers[index]) return
      const next = { ...layers[index], ...changes }
      if (next.opacity !== undefined) next.opacity = clamp(next.opacity, 0, 1)
      setDocument(
        celsRef.current,
        layers.map((l, i) => (i === index ? next : l)),
      )
      if (commit) commitHistory(undefined, index)
    },
    [setDocument, commitHistory],
  )

  /** Gives frame `index` its own duration in milliseconds, or null to follow fps, as one undo step. */
  const setFrameDuration = useCallback(
    (index: number, duration: unknown) => {
      const durations = [...durationsRef.current]
      if (index < 0 || index >= durations.length) return
      durations[index] = cleanDuration(duration)
      if (durations[index] === durationsRef.current[index]) return
      setCels(celsRef.current, frameIndexRef.current, durations)
      commitHistory(index)
    },
    [setCels, commitHistory],
  )

  const setFps = useCallback((fps: number) => {
    setState(prev => ({ ...prev, fps: clamp(Math.round(fps) || 1, 1, MAX_FPS) }))
  }, [])

  const toggleOnionSkin = useCallback(() => {
    setState(prev => ({ ...prev, onionSkin: !prev.onionSkin }))
  }, [])

  /** Replaces the whole document, for example with an opened project, and starts a fresh history. */
  /**
   * Replaces the whole document and starts a fresh history.
   * With saved false it counts as unsaved changes, for work that was never written to a file.
   */
  const importDocument = useCallback(
    (doc: EditorDocument, saved = true) => {
      const { width, height } = doc
      if (doc.cels.length === 0 || doc.layers.length === 0) return
      const cels = doc.cels.map(row => row.map(pixels => ({ width, height, pixels })))
      const layers = doc.layers.map(({ name, ...rest }) => createLayer(name, rest))
      const durations = normalizeDurations(doc.durations, cels.length)
      historyRef.current = [{ cels, layers, durations, frame: 0, layer: 0 }]
      savedEntryRef.current = saved ? historyRef.current[0] : null
      selHistoryRef.current = [null]
      historyIndexRef.current = 0
      floatRef.current = null
      shapeBaseRef.current = null
      selectionRef.current = null
      // Draw on the top layer, as it is the one in front
      setDocument(cels, layers, 0, layers.length - 1, durations)
      syncHistory()
      setState(prev => ({
        ...prev,
        selection: null,
        fps: doc.fps ? clamp(Math.round(doc.fps), 1, MAX_FPS) : prev.fps,
        zoom: Math.max(1, Math.floor(1024 / Math.max(width, height))),
      }))
    },
    [setDocument, syncHistory],
  )

  /** Replaces the document with frames of a single layer. */
  const importFrames = useCallback(
    (framePixels: string[][][], width: number, height: number, fps?: number, durations?: FrameDuration[]) =>
      importDocument({
        width,
        height,
        fps,
        durations,
        cels: framePixels.map(pixels => [pixels]),
        layers: [{ name: 'Layer 1', visible: true, opacity: 1 }],
      }),
    [importDocument],
  )

  /** Replaces the document with a single image. */
  const importPixels = useCallback(
    (pixels: string[][], width: number, height: number) => importFrames([pixels], width, height),
    [importFrames],
  )

  /** Marks the current state as the one written to disk. */
  const markSaved = useCallback(() => {
    savedEntryRef.current = historyRef.current[historyIndexRef.current]
    syncHistory()
  }, [syncHistory])

  /** isDirty: the document differs from the last save. */
  const { canUndo, canRedo, isDirty } = historyStatus

  return {
    state,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
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
    shiftCel,
    nudgeCel,
    drawShape,
    fillRegion,
    shadePixel,
    commitHistory,
    pickColor,
    resizeCanvas,
    clearCanvas,
    applyPixels,
    remapColors,
    importPixels,
    importFrames,
    importDocument,
    selectFrame,
    selectLayer,
    addLayer,
    duplicateLayer,
    deleteLayer,
    moveLayer,
    mergeLayerDown,
    updateLayer,
    addFrame,
    duplicateFrame,
    deleteFrame,
    moveFrame,
    setFps,
    setFrameDuration,
    toggleOnionSkin,
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
