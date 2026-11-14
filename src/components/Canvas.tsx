import { useRef, useEffect, useCallback, useImperativeHandle, useState } from 'react'
import type { PixelData, Tool, ShapeTool, Selection } from '../types'
import { brushFootprints } from '../utils/brush'
import { TRANSPARENT } from '../utils/color'
import { drawPixels } from '../utils/png'

const cursorMap: Record<string, string> = {
  pencil: 'crosshair',
  eraser: 'crosshair',
  shade: 'crosshair',
  fill: 'crosshair',
  picker: 'crosshair',
  selection: 'crosshair',
  line: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
}

const isShapeTool = (tool: Tool): tool is ShapeTool => tool === 'line' || tool === 'rect' || tool === 'ellipse'

export interface CanvasHandle {
  /** Zoom at which the whole canvas fits the visible area, or null if the area has no size yet */
  getFitZoom: () => number | null
  /** Moves the view back to the origin */
  resetPan: () => void
}

export type Point = { x: number; y: number }

/** Size of the square the tool paints, shown around the pointer; null for tools that do not paint. */
function footprintSize(tool: Tool, brushSize: number, shapeFilled: boolean): number | null {
  if (tool === 'pencil' || tool === 'eraser' || tool === 'line') return brushSize
  if (tool === 'rect' || tool === 'ellipse') return shapeFilled ? 1 : brushSize
  if (tool === 'shade' || tool === 'fill' || tool === 'picker') return 1
  return null
}

/** Side, in screen pixels, of each square of the transparency checkerboard; it does not change with zoom */
const CHECKER_SIZE = 8
const CHECKER_LIGHT = '#f0f0f0'
const CHECKER_DARK = '#cfcfcf'

let checkerTile: HTMLCanvasElement | null = null

/** A 2x2 checker tile, created once and repeated as a pattern behind the pixels. */
function getCheckerTile(): HTMLCanvasElement {
  if (checkerTile) return checkerTile
  const tile = document.createElement('canvas')
  tile.width = tile.height = CHECKER_SIZE * 2
  const ctx = tile.getContext('2d')!
  ctx.fillStyle = CHECKER_LIGHT
  ctx.fillRect(0, 0, CHECKER_SIZE * 2, CHECKER_SIZE * 2)
  ctx.fillStyle = CHECKER_DARK
  ctx.fillRect(CHECKER_SIZE, 0, CHECKER_SIZE, CHECKER_SIZE)
  ctx.fillRect(0, CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE)
  checkerTile = tile
  return tile
}

/** How the previous frame shows under the current one with onion skin: faint and tinted red */
const ONION_ALPHA = 0.35
const ONION_TINT = 'rgba(255, 70, 70, 0.55)'

/** Below this zoom the grid lines would hide the pixels, so they are not drawn */
const MIN_GRID_ZOOM = 4

interface CanvasProps {
  handleRef?: React.Ref<CanvasHandle>
  showGrid: boolean
  mirrorX: boolean
  mirrorY: boolean
  pixelData: PixelData
  /** Frame shown faintly under the canvas (onion skin), or null */
  onionFrame?: PixelData | null
  tool: Tool
  primaryColor: string
  secondaryColor: string
  zoom: number
  brushSize: number
  shapeFilled: boolean
  onPaintLine: (x0: number, y0: number, x1: number, y1: number, color: string, size: number) => void
  onShapeStart: () => void
  onDrawShape: (
    shape: ShapeTool,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    size: number,
    filled: boolean,
  ) => void
  onFillRegion: (x: number, y: number, color: string) => void
  onShadePixel: (x: number, y: number) => void
  onStrokeEnd: () => void
  onPickColor: (x: number, y: number) => string | null
  onColorPicked: (color: string, secondary: boolean) => void
  selection: Selection | null
  onSelectionChange: (sel: Selection | null) => void
  /** Starts dragging the selection; with copy the original stays in place. Returns false if nothing is selected. */
  onMoveStart: (copy: boolean) => boolean
  onMoveTo: (x: number, y: number) => void
  onZoomStep: (direction: 1 | -1) => void
  /** The pixel under the pointer, or null when it leaves the canvas */
  onHoverPixel?: (pixel: Point | null) => void
}

export default function Canvas({
  handleRef,
  showGrid,
  mirrorX,
  mirrorY,
  pixelData,
  onionFrame = null,
  tool,
  primaryColor,
  secondaryColor,
  zoom,
  brushSize,
  shapeFilled,
  onPaintLine,
  onShapeStart,
  onDrawShape,
  onFillRegion,
  onShadePixel,
  onStrokeEnd,
  onPickColor,
  onColorPicked,
  selection,
  onSelectionChange,
  onMoveStart,
  onMoveTo,
  onZoomStep,
  onHoverPixel,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const textureRef = useRef<HTMLCanvasElement | null>(null)
  const onionTextureRef = useRef<HTMLCanvasElement | null>(null)
  // Refs rather than state so pointer events that arrive before the next render see the stroke
  const isDrawingRef = useRef(false)
  const strokeColorRef = useRef(primaryColor)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  // Rectangle being dragged out with the selection tool (kept in a ref too for the pointer handlers)
  const selDragRef = useRef<{ start: Point; end: Point } | null>(null)
  const [selDrag, setSelDragState] = useState<{ start: Point; end: Point } | null>(null)
  // Drag of an existing selection: where the pointer started and where the selection was
  const moveRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [hoverInSelection, setHoverInSelection] = useState(false)
  // Pixel under the pointer, to outline what the tool will paint
  const [hover, setHoverState] = useState<Point | null>(null)
  const hoverRef = useRef<Point | null>(null)

  const { width, height, pixels } = pixelData

  useImperativeHandle(
    handleRef,
    () => ({
      getFitZoom: () => {
        const box = containerRef.current
        if (!box || box.clientWidth === 0 || box.clientHeight === 0) return null
        return Math.max(1, Math.floor(Math.min(box.clientWidth / width, box.clientHeight / height)))
      },
      resetPan: () => setPan({ x: 0, y: 0 }),
    }),
    [width, height],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const tc = textureRef.current
    if (!tc) return

    const pixelSize = zoom
    const cw = width * pixelSize
    const ch = height * pixelSize

    canvas.width = cw
    canvas.height = ch
    ctx.imageSmoothingEnabled = false
    // Transparent and partly transparent pixels show the checkerboard through, as they will look when exported
    ctx.fillStyle = ctx.createPattern(getCheckerTile(), 'repeat')!
    ctx.fillRect(0, 0, cw, ch)
    const onion = onionTextureRef.current
    if (onion && onion.width === width && onion.height === height) {
      ctx.globalAlpha = ONION_ALPHA
      ctx.drawImage(onion, 0, 0, cw, ch)
      ctx.globalAlpha = 1
    }
    ctx.drawImage(tc, 0, 0, cw, ch)

    if (showGrid && pixelSize >= MIN_GRID_ZOOM) {
      // Mid gray, half transparent: visible on the checkerboard, on light and on dark pixels
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      // +0.5 keeps the 1px lines crisp instead of blurred across two device pixels
      for (let x = 1; x < width; x++) {
        ctx.moveTo(x * pixelSize + 0.5, 0)
        ctx.lineTo(x * pixelSize + 0.5, ch)
      }
      for (let y = 1; y < height; y++) {
        ctx.moveTo(0, y * pixelSize + 0.5)
        ctx.lineTo(cw, y * pixelSize + 0.5)
      }
      ctx.stroke()
    }

    // Symmetry axes, so it is clear where drawing is mirrored
    if (mirrorX || mirrorY) {
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#4fc3f7'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      if (mirrorX) {
        ctx.moveTo(cw / 2, 0)
        ctx.lineTo(cw / 2, ch)
      }
      if (mirrorY) {
        ctx.moveTo(0, ch / 2)
        ctx.lineTo(cw, ch / 2)
      }
      ctx.stroke()
      ctx.restore()
    }

    const rect = selDrag
      ? {
          x: Math.min(selDrag.start.x, selDrag.end.x),
          y: Math.min(selDrag.start.y, selDrag.end.y),
          width: Math.abs(selDrag.end.x - selDrag.start.x) + 1,
          height: Math.abs(selDrag.end.y - selDrag.start.y) + 1,
        }
      : selection
    if (rect) {
      const rx = rect.x * pixelSize
      const ry = rect.y * pixelSize
      const rw = rect.width * pixelSize
      const rh = rect.height * pixelSize

      ctx.fillStyle = 'rgba(79, 195, 247, 0.1)'
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeStyle = '#4fc3f7'
      ctx.lineWidth = 2
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.setLineDash([])
    }

    // Outline of what the tool will paint, mirrored like the stroke; dark and light so it shows on any color
    const size = hover && !isPanning ? footprintSize(tool, brushSize, shapeFilled) : null
    if (hover && size !== null) {
      const mirrored = tool !== 'fill' && tool !== 'picker' && tool !== 'shade'
      ctx.save()
      for (const sq of brushFootprints(
        hover.x,
        hover.y,
        size,
        width,
        height,
        mirrored && mirrorX,
        mirrored && mirrorY,
      )) {
        const x = sq.x * pixelSize
        const y = sq.y * pixelSize
        const w = sq.width * pixelSize
        const h = sq.height * pixelSize
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)'
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
        if (w > 3 && h > 3) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
          ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3)
        }
      }
      ctx.restore()
    }
  }, [
    zoom,
    selection,
    selDrag,
    width,
    height,
    showGrid,
    mirrorX,
    mirrorY,
    hover,
    isPanning,
    tool,
    brushSize,
    shapeFilled,
  ])

  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const tc = document.createElement('canvas')
    drawPixels(tc, pixels, width, height)
    textureRef.current = tc
    drawRef.current()
  }, [pixels, width, height])

  useEffect(() => {
    if (!onionFrame) {
      onionTextureRef.current = null
    } else {
      const tc = document.createElement('canvas')
      drawPixels(tc, onionFrame.pixels, onionFrame.width, onionFrame.height)
      // Tint only where the frame has pixels, so it can't be mistaken for the real ones
      const tctx = tc.getContext('2d')
      if (tctx) {
        tctx.globalCompositeOperation = 'source-atop'
        tctx.fillStyle = ONION_TINT
        tctx.fillRect(0, 0, tc.width, tc.height)
      }
      onionTextureRef.current = tc
    }
    drawRef.current()
  }, [onionFrame])

  useEffect(() => {
    draw()
  }, [draw])

  // React registers wheel listeners as passive, so preventDefault only works on a native listener
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      onZoomStep(e.deltaY < 0 ? 1 : -1)
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [onZoomStep])

  const getPixelCoords = useCallback(
    (clientX: number, clientY: number) => {
      // The bounding rect already includes the pan transform
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return null
      const px = Math.floor((clientX - rect.left) / zoom)
      const py = Math.floor((clientY - rect.top) / zoom)
      if (px < 0 || px >= width || py < 0 || py >= height) return null
      return { x: px, y: py }
    },
    [zoom, width, height],
  )

  /** Like getPixelCoords but also for pointers outside the canvas, so a dragged selection can reach the edges. */
  const getRawCoords = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return null
      return { x: Math.floor((clientX - rect.left) / zoom), y: Math.floor((clientY - rect.top) / zoom) }
    },
    [zoom],
  )

  const setHover = useCallback(
    (pixel: Point | null) => {
      const prev = hoverRef.current
      if (prev === pixel || (prev && pixel && prev.x === pixel.x && prev.y === pixel.y)) return
      hoverRef.current = pixel
      setHoverState(pixel)
      onHoverPixel?.(pixel)
    },
    [onHoverPixel],
  )

  const setSelDrag = useCallback((drag: { start: Point; end: Point } | null) => {
    selDragRef.current = drag
    setSelDragState(drag)
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        setIsPanning(true)
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
        return
      }
      if (e.button !== 0 && e.button !== 2) return
      const secondary = e.button === 2

      if (tool === 'selection') {
        if (secondary) return
        const coords = getPixelCoords(e.clientX, e.clientY)
        const inside =
          !!selection &&
          !!coords &&
          coords.x >= selection.x &&
          coords.x < selection.x + selection.width &&
          coords.y >= selection.y &&
          coords.y < selection.y + selection.height
        // Dragging inside the selection moves it (Alt copies it); anywhere else starts a new selection
        if (inside && onMoveStart(e.altKey)) {
          moveRef.current = { startX: coords.x, startY: coords.y, originX: selection.x, originY: selection.y }
          return
        }
        onSelectionChange(null)
        if (!coords) return
        setSelDrag({ start: coords, end: coords })
        return
      }

      const coords = getPixelCoords(e.clientX, e.clientY)
      if (!coords) return
      const color = secondary ? secondaryColor : primaryColor

      if (tool === 'fill') {
        onFillRegion(coords.x, coords.y, color)
      } else if (tool === 'picker') {
        const picked = onPickColor(coords.x, coords.y)
        if (picked) onColorPicked(picked, secondary)
      } else if (tool === 'shade') {
        isDrawingRef.current = true
        lastPosRef.current = coords
        onShadePixel(coords.x, coords.y)
      } else if (isShapeTool(tool)) {
        isDrawingRef.current = true
        lastPosRef.current = coords
        shapeStartRef.current = coords
        strokeColorRef.current = color
        onShapeStart()
        onDrawShape(tool, coords.x, coords.y, coords.x, coords.y, color, brushSize, shapeFilled)
      } else {
        isDrawingRef.current = true
        lastPosRef.current = coords
        strokeColorRef.current = tool === 'eraser' ? TRANSPARENT : color
        onPaintLine(coords.x, coords.y, coords.x, coords.y, strokeColorRef.current, brushSize)
      }
    },
    [
      tool,
      primaryColor,
      secondaryColor,
      getPixelCoords,
      onFillRegion,
      onPickColor,
      onColorPicked,
      onShadePixel,
      onPaintLine,
      onShapeStart,
      onDrawShape,
      shapeFilled,
      pan,
      selection,
      onSelectionChange,
      onMoveStart,
      setSelDrag,
      brushSize,
    ],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      setHover(getPixelCoords(e.clientX, e.clientY))

      if (isPanning) {
        setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y })
        return
      }

      const move = moveRef.current
      if (move) {
        const raw = getRawCoords(e.clientX, e.clientY)
        if (raw) onMoveTo(move.originX + raw.x - move.startX, move.originY + raw.y - move.startY)
        return
      }

      const drag = selDragRef.current
      if (drag) {
        const coords = getPixelCoords(e.clientX, e.clientY)
        if (coords) setSelDrag({ start: drag.start, end: coords })
        return
      }

      if (tool === 'selection') {
        const coords = getPixelCoords(e.clientX, e.clientY)
        setHoverInSelection(
          !!selection &&
            !!coords &&
            coords.x >= selection.x &&
            coords.x < selection.x + selection.width &&
            coords.y >= selection.y &&
            coords.y < selection.y + selection.height,
        )
        return
      }

      if (!isDrawingRef.current) return
      const coords = getPixelCoords(e.clientX, e.clientY)
      if (!coords) return
      const last = lastPosRef.current ?? coords
      if (last.x === coords.x && last.y === coords.y && lastPosRef.current) return
      lastPosRef.current = coords
      if (tool === 'shade') {
        onShadePixel(coords.x, coords.y)
      } else if (isShapeTool(tool)) {
        const start = shapeStartRef.current ?? coords
        onDrawShape(tool, start.x, start.y, coords.x, coords.y, strokeColorRef.current, brushSize, shapeFilled)
      } else {
        onPaintLine(last.x, last.y, coords.x, coords.y, strokeColorRef.current, brushSize)
      }
    },
    [
      isPanning,
      tool,
      selection,
      setHover,
      getPixelCoords,
      getRawCoords,
      setSelDrag,
      onMoveTo,
      onShadePixel,
      onPaintLine,
      onDrawShape,
      shapeFilled,
      brushSize,
    ],
  )

  const handlePointerUp = useCallback(() => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false
      lastPosRef.current = null
      shapeStartRef.current = null
      onStrokeEnd()
    }
    setIsPanning(false)

    // Dropping a dragged selection is one undo step
    if (moveRef.current) {
      moveRef.current = null
      onStrokeEnd()
    }

    const drag = selDragRef.current
    if (drag) {
      setSelDrag(null)
      // A plain click, without dragging, just deselects (the selection was cleared when the click started)
      if (drag.start.x !== drag.end.x || drag.start.y !== drag.end.y) {
        onSelectionChange({
          x: Math.min(drag.start.x, drag.end.x),
          y: Math.min(drag.start.y, drag.end.y),
          width: Math.abs(drag.end.x - drag.start.x) + 1,
          height: Math.abs(drag.end.y - drag.start.y) + 1,
        })
      }
    }
  }, [onSelectionChange, onStrokeEnd, setSelDrag])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'auto',
        background: '#1e1e1e',
        cursor: isPanning
          ? 'grabbing'
          : tool === 'selection' && hoverInSelection
            ? 'move'
            : cursorMap[tool] || 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          handlePointerUp()
          setHover(null)
        }}
        onContextMenu={e => e.preventDefault()}
        style={{
          display: 'block',
          imageRendering: 'pixelated',
          transform: `translate(${pan.x}px, ${pan.y}px)`,
        }}
      />
    </div>
  )
}
