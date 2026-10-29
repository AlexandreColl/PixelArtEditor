import { useRef, useEffect, useCallback, useImperativeHandle, useState } from 'react'
import type { PixelData, Tool, ShapeTool, Selection } from '../types'
import { TRANSPARENT, parseColor } from '../utils/color'

const cursorMap: Record<string, string> = {
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

type Point = { x: number; y: number }

/** Below this zoom the grid lines would hide the pixels, so they are not drawn */
const MIN_GRID_ZOOM = 4

interface CanvasProps {
  handleRef?: React.Ref<CanvasHandle>
  showGrid: boolean
  mirrorX: boolean
  mirrorY: boolean
  pixelData: PixelData
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
}

export default function Canvas({
  handleRef,
  showGrid,
  mirrorX,
  mirrorY,
  pixelData,
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
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const textureRef = useRef<HTMLCanvasElement | null>(null)
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
    ctx.drawImage(tc, 0, 0, cw, ch)

    if (showGrid && pixelSize >= MIN_GRID_ZOOM) {
      ctx.strokeStyle = '#c0c0c0'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= width; x++) {
        ctx.beginPath()
        ctx.moveTo(x * pixelSize, 0)
        ctx.lineTo(x * pixelSize, ch)
        ctx.stroke()
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * pixelSize)
        ctx.lineTo(cw, y * pixelSize)
        ctx.stroke()
      }
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
  }, [zoom, selection, selDrag, width, height, showGrid, mirrorX, mirrorY])

  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const tc = document.createElement('canvas')
    tc.width = width
    tc.height = height
    const tctx = tc.getContext('2d')!
    const imageData = tctx.createImageData(width, height)
    const data = imageData.data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = pixels[y]?.[x] ?? TRANSPARENT
        const i = (y * width + x) * 4
        const [r, g, b, a] = parseColor(color) ?? [0, 0, 0, 0]
        if (a === 0) {
          data[i] = 224
          data[i + 1] = 224
          data[i + 2] = 224
          data[i + 3] = 255
        } else {
          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = a
        }
      }
    }
    tctx.putImageData(imageData, 0, 0)
    textureRef.current = tc
    drawRef.current()
  }, [pixels, width, height])

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
        onPointerLeave={handlePointerUp}
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
