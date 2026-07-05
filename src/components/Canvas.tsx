import { useRef, useEffect, useCallback, useState } from 'react'
import type { PixelData, Tool, Selection } from '../types'

const cursorMap: Record<string, string> = {
  fill: 'crosshair',
  picker: 'crosshair',
  selection: 'crosshair',
}

function hexToRgba(hex: string): [number, number, number, number] {
  if (hex.startsWith('rgba')) {
    const m = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Math.round(Number(m[4]) * 255) : 255]
    return [0, 0, 0, 0]
  }
  if (hex.startsWith('#')) {
    const v = parseInt(hex.slice(1), 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255]
  }
  return [0, 0, 0, 0]
}

interface CanvasProps {
  pixelData: PixelData
  tool: Tool
  primaryColor: string
  zoom: number
  brushSize: number
  onPaintBrush: (x: number, y: number, color: string, size: number) => void
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
  brushSize,
  onPaintBrush,
  onFillRegion,
  onShadePixel,
  onPickColor,
  onSelectionChange,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textureRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
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
    ctx.save()
    ctx.translate(pan.x, pan.y)
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

    ctx.restore()
  }, [zoom, pan, selEnd, width, height])

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
        const color = pixels[y][x]
        const i = (y * width + x) * 4
        if (color === 'rgba(0,0,0,0)') {
          data[i] = 224
          data[i + 1] = 224
          data[i + 2] = 224
          data[i + 3] = 255
        } else {
          const [r, g, b, a] = hexToRgba(color)
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

  const getPixelCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return null
      const mx = clientX - rect.left - pan.x
      const my = clientY - rect.top - pan.y
      const px = Math.floor(mx / zoom)
      const py = Math.floor(my / zoom)
      if (px < 0 || px >= width || py < 0 || py >= height) return null
      return { x: px, y: py }
    },
    [zoom, width, height, pan],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1) {
        setIsPanning(true)
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
        return
      }

      if (tool === 'selection') {
        selStartRef.current = null
        setSelEnd(null)
        onSelectionChange(null)
        const coords = getPixelCoords(e.clientX, e.clientY)
        if (!coords) return
        selStartRef.current = coords
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
        onPaintBrush(coords.x, coords.y, color, brushSize)
      }
    },
    [tool, primaryColor, getPixelCoords, onFillRegion, onPickColor, pan, onSelectionChange, brushSize],
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

      if (!isDrawing) return
      const coords = getPixelCoords(e.clientX, e.clientY)
      if (!coords) return
      if (tool === 'shade') {
        onShadePixel(coords.x, coords.y)
      } else {
        const color = tool === 'eraser' ? 'rgba(0,0,0,0)' : primaryColor
        onPaintBrush(coords.x, coords.y, color, brushSize)
      }
    },
    [isDrawing, isPanning, tool, primaryColor, getPixelCoords, brushSize],
  )

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false)
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
  }, [tool, selEnd, onSelectionChange])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const event = new CustomEvent('canvas-zoom', { detail: e.deltaY < 0 ? 1 : -1 })
    window.dispatchEvent(event)
  }, [])

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
