import { useRef, useEffect, useCallback, useState } from 'react'
import type { PixelData, Tool, Selection } from '../types'
import { TRANSPARENT, parseColor } from '../utils/color'

const cursorMap: Record<string, string> = {
  fill: 'crosshair',
  picker: 'crosshair',
  selection: 'crosshair',
}

interface CanvasProps {
  pixelData: PixelData
  tool: Tool
  primaryColor: string
  secondaryColor: string
  zoom: number
  brushSize: number
  onPaintLine: (x0: number, y0: number, x1: number, y1: number, color: string, size: number) => void
  onFillRegion: (x: number, y: number, color: string) => void
  onShadePixel: (x: number, y: number) => void
  onStrokeEnd: () => void
  onPickColor: (x: number, y: number) => string | null
  onColorPicked: (color: string, secondary: boolean) => void
  onSelectionChange: (sel: Selection | null) => void
  onZoomStep: (direction: 1 | -1) => void
}

export default function Canvas({
  pixelData,
  tool,
  primaryColor,
  secondaryColor,
  zoom,
  brushSize,
  onPaintLine,
  onFillRegion,
  onShadePixel,
  onStrokeEnd,
  onPickColor,
  onColorPicked,
  onSelectionChange,
  onZoomStep,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textureRef = useRef<HTMLCanvasElement | null>(null)
  // Refs rather than state so pointer events that arrive before the next render see the stroke
  const isDrawingRef = useRef(false)
  const strokeColorRef = useRef(primaryColor)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const selStartRef = useRef<{ x: number; y: number } | null>(null)
  const [selEnd, setSelEnd] = useState<{ x: number; y: number } | null>(null)

  const { width, height, pixels } = pixelData

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

    const sx = selStartRef.current
    const ex = selEnd
    if (sx && ex) {
      const rx = Math.min(sx.x, ex.x) * pixelSize
      const ry = Math.min(sx.y, ex.y) * pixelSize
      const rw = (Math.abs(ex.x - sx.x) + 1) * pixelSize
      const rh = (Math.abs(ex.y - sx.y) + 1) * pixelSize

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
  }, [zoom, selEnd, width, height])

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

  // A selection from the previous canvas size would point outside the new one
  useEffect(() => {
    selStartRef.current = null
    setSelEnd(null)
    onSelectionChange(null)
  }, [width, height, onSelectionChange])

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
        selStartRef.current = null
        setSelEnd(null)
        onSelectionChange(null)
        const coords = getPixelCoords(e.clientX, e.clientY)
        if (!coords) return
        selStartRef.current = coords
        setSelEnd(coords)
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
      pan,
      onSelectionChange,
      brushSize,
    ],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y })
        return
      }

      if (tool === 'selection' && selStartRef.current) {
        const coords = getPixelCoords(e.clientX, e.clientY)
        if (coords) setSelEnd(coords)
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
      } else {
        onPaintLine(last.x, last.y, coords.x, coords.y, strokeColorRef.current, brushSize)
      }
    },
    [isPanning, tool, getPixelCoords, onShadePixel, onPaintLine, brushSize],
  )

  const handlePointerUp = useCallback(() => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false
      lastPosRef.current = null
      onStrokeEnd()
    }
    setIsPanning(false)

    const sx = selStartRef.current
    const ex = selEnd
    if (tool === 'selection' && sx && ex) {
      const x = Math.min(sx.x, ex.x)
      const y = Math.min(sx.y, ex.y)
      const w = Math.abs(ex.x - sx.x) + 1
      const h = Math.abs(ex.y - sx.y) + 1
      onSelectionChange({ x, y, width: w, height: h })
    }
  }, [tool, selEnd, onSelectionChange, onStrokeEnd])

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        background: '#1e1e1e',
        cursor: isPanning ? 'grabbing' : cursorMap[tool] || 'default',
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
