import { useRef, useEffect, useCallback, useState } from 'react'
import type { PixelData, Tool, Selection } from '../types'

interface CanvasProps {
  pixelData: PixelData
  tool: Tool
  primaryColor: string
  zoom: number
  onPaintPixel: (x: number, y: number, color: string) => void
  onFillRegion: (x: number, y: number, color: string) => void
  onShadePixel: (x: number, y: number) => void
  onPickColor: (x: number, y: number) => string | null
  onSelectionChange: (sel: Selection | null) => void
}

export default function Canvas({
  pixelData,
  tool,
  primaryColor,
  zoom,
  onPaintPixel,
  onFillRegion,
  onShadePixel,
  onPickColor,
  onSelectionChange,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [selStart, setSelStart] = useState<{ x: number; y: number } | null>(null)
  const [selEnd, setSelEnd] = useState<{ x: number; y: number } | null>(null)

  const { width, height, pixels } = pixelData
  const pixelSize = zoom

  const getPixelCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return null
      const mx = clientX - rect.left - pan.x
      const my = clientY - rect.top - pan.y
      const px = Math.floor(mx / pixelSize)
      const py = Math.floor(my / pixelSize)
      if (px < 0 || px >= width || py < 0 || py >= height) return null
      return { x: px, y: py }
    },
    [pixelSize, width, height, pan]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const canvasWidth = width * pixelSize
    const canvasHeight = height * pixelSize

    canvas.width = canvasWidth + Math.abs(pan.x) * 2
    canvas.height = canvasHeight + Math.abs(pan.y) * 2
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(pan.x, pan.y)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = pixels[y][x]
        ctx.fillStyle = color === 'rgba(0,0,0,0)' ? '#e0e0e0' : color
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize)
      }
    }

    ctx.strokeStyle = '#c0c0c0'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * pixelSize, 0)
      ctx.lineTo(x * pixelSize, height * pixelSize)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * pixelSize)
      ctx.lineTo(width * pixelSize, y * pixelSize)
      ctx.stroke()
    }

    const sx = selStart
    const ex = selEnd
    if (sx && ex) {
      const x = Math.min(sx.x, ex.x) * pixelSize
      const y = Math.min(sx.y, ex.y) * pixelSize
      const w = (Math.abs(ex.x - sx.x) + 1) * pixelSize
      const h = (Math.abs(ex.y - sx.y) + 1) * pixelSize

      ctx.fillStyle = 'rgba(79, 195, 247, 0.1)'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = '#4fc3f7'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)

      ctx.setLineDash([4, 4])
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }

    ctx.restore()
  }, [pixels, width, height, pixelSize, pan, selStart, selEnd])

  useEffect(() => {
    draw()
  }, [draw])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1) {
        setIsPanning(true)
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
        return
      }

      if (tool === 'select') {
        setIsPanning(true)
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
        return
      }

      if (tool === 'selection') {
        setSelStart(null)
        setSelEnd(null)
        onSelectionChange(null)
        const coords = getPixelCoords(e.clientX, e.clientY)
        if (!coords) return
        setSelStart(coords)
        setSelEnd(coords)
        return
      }

      if (e.button !== 0) return
      const coords = getPixelCoords(e.clientX, e.clientY)
      if (!coords) return

      if (tool === 'fill') {
        onFillRegion(coords.x, coords.y, primaryColor)
      } else if (tool === 'shade') {
        setIsDrawing(true)
        onShadePixel(coords.x, coords.y)
      } else if (tool === 'picker') {
        const color = onPickColor(coords.x, coords.y)
        if (color) {
          const event = new CustomEvent('pick-color', { detail: color })
          window.dispatchEvent(event)
        }
      } else {
        setIsDrawing(true)
        const color = tool === 'eraser' ? 'rgba(0,0,0,0)' : primaryColor
        onPaintPixel(coords.x, coords.y, color)
      }
    },
    [tool, primaryColor, getPixelCoords, onPaintPixel, onFillRegion, onPickColor, pan, onSelectionChange]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
        return
      }

      if (tool === 'selection' && selStart) {
        const coords = getPixelCoords(e.clientX, e.clientY)
        if (coords) setSelEnd(coords)
        return
      }

      if (!isDrawing) return
      const coords = getPixelCoords(e.clientX, e.clientY)
      if (!coords) return
      if (tool === 'shade') {
        onShadePixel(coords.x, coords.y)
      } else {
        const color = tool === 'eraser' ? 'rgba(0,0,0,0)' : primaryColor
        onPaintPixel(coords.x, coords.y, color)
      }
    },
    [isDrawing, isPanning, panStart, tool, primaryColor, getPixelCoords, onPaintPixel, selStart]
  )

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false)
    setIsPanning(false)

    if (tool === 'selection' && selStart && selEnd) {
      const x = Math.min(selStart.x, selEnd.x)
      const y = Math.min(selStart.y, selEnd.y)
      const w = Math.abs(selEnd.x - selStart.x) + 1
      const h = Math.abs(selEnd.y - selStart.y) + 1
      onSelectionChange({ x, y, width: w, height: h })
    }
  }, [tool, selStart, selEnd, onSelectionChange])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const event = new CustomEvent('canvas-zoom', { detail: e.deltaY < 0 ? 1 : -1 })
      window.dispatchEvent(event)
    },
    []
  )

  const cursorMap: Record<string, string> = {
    fill: 'crosshair',
    picker: 'crosshair',
    selection: 'crosshair',
    select: 'grab',
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#1e1e1e',
        cursor: cursorMap[tool] || 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        style={{
          imageRendering: 'pixelated',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      />
    </div>
  )
}
