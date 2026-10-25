import { useEffect, useMemo, useRef, useState } from 'react'
import type { PixelData } from '../types'
import { downscale, fitSize, quantize } from '../utils/pixelate'
import { parseColor } from '../utils/color'

/** Images up to this long side can still be opened unconverted without freezing the editor */
export const MAX_ORIGINAL_SIZE = 512

const SIZE_PRESETS = [16, 24, 32, 48, 64, 96, 128, 192, 256]
const PREVIEW_BOX = 240

interface ConvertDialogProps {
  image: ImageData
  fileName: string
  onConvert: (pixelData: PixelData) => void
  onOpenOriginal: () => void
  onCancel: () => void
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#aaa',
  display: 'flex',
  justifyContent: 'space-between',
}
const buttonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid #555',
  background: 'transparent',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: 13,
}

export default function ConvertDialog({ image, fileName, onConvert, onOpenOriginal, onCancel }: ConvertDialogProps) {
  const longSide = Math.max(image.width, image.height)
  const sizeOptions = useMemo(() => {
    const options = SIZE_PRESETS.filter(s => s < longSide)
    if (longSide <= SIZE_PRESETS[SIZE_PRESETS.length - 1]) options.push(longSide)
    return options
  }, [longSide])

  const [size, setSize] = useState(() => sizeOptions.reduce((best, s) => (s <= 64 ? s : best), sizeOptions[0]))
  const [colors, setColors] = useState(16)
  const [dither, setDither] = useState(false)
  const [alphaThreshold, setAlphaThreshold] = useState(128)

  const hasTransparency = useMemo(() => {
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] < 255) return true
    return false
  }, [image])

  // Downscaling is the slow step, so it only reruns when the size changes
  const downscaled = useMemo(() => {
    const target = fitSize(image.width, image.height, size)
    return downscale(image, target.width, target.height)
  }, [image, size])

  const result = useMemo(
    () => quantize(downscaled, { colors, dither, alphaThreshold }),
    [downscaled, colors, dither, alphaThreshold],
  )

  const originalRef = useRef<HTMLCanvasElement>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)

  const previewScale = Math.min(PREVIEW_BOX / image.width, PREVIEW_BOX / image.height)
  const previewW = Math.max(1, Math.round(image.width * previewScale))
  const previewH = Math.max(1, Math.round(image.height * previewScale))

  useEffect(() => {
    const canvas = originalRef.current
    if (!canvas) return
    const full = document.createElement('canvas')
    full.width = image.width
    full.height = image.height
    full.getContext('2d')!.putImageData(image, 0, 0)
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(full, 0, 0, canvas.width, canvas.height)
  }, [image])

  useEffect(() => {
    const canvas = resultRef.current
    if (!canvas) return
    canvas.width = result.width
    canvas.height = result.height
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(result.width, result.height)
    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        const [r, g, b, a] = parseColor(result.pixels[y][x]) ?? [0, 0, 0, 0]
        const i = (y * result.width + x) * 4
        imageData.data.set([r, g, b, a], i)
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }, [result])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConvert(result)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel, onConvert, result])

  const canOpenOriginal = longSide <= MAX_ORIGINAL_SIZE
  // Checkerboard so transparent areas are visible in both previews
  const checker: React.CSSProperties = {
    background: 'repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px',
    border: '1px solid #444',
  }

  return (
    <div
      role="dialog"
      aria-label="Convert to pixel art"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#2d2d2d',
          border: '1px solid #444',
          borderRadius: 10,
          padding: 20,
          width: 'min(600px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: '#e0e0e0',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Convert to pixel art</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {fileName} · {image.width}×{image.height}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <canvas ref={originalRef} width={previewW} height={previewH} style={checker} />
            <figcaption style={{ fontSize: 11, color: '#888' }}>Original</figcaption>
          </figure>
          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <canvas
              ref={resultRef}
              data-testid="pixelate-preview"
              style={{ ...checker, width: previewW, height: previewH, imageRendering: 'pixelated' }}
            />
            <figcaption style={{ fontSize: 11, color: '#888' }}>
              Pixel art · {result.width}×{result.height}
            </figcaption>
          </figure>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>
              Size (long side) <span>{size}px</span>
            </span>
            <select
              value={size}
              onChange={e => setSize(Number(e.target.value))}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid #555',
                background: '#1e1e1e',
                color: '#e0e0e0',
              }}
            >
              {sizeOptions.map(s => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>
              Colors <span>{colors}</span>
            </span>
            <input type="range" min={2} max={64} value={colors} onChange={e => setColors(Number(e.target.value))} />
          </label>

          {hasTransparency && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>
                Transparency threshold <span>{Math.round((alphaThreshold / 255) * 100)}%</span>
              </span>
              <input
                type="range"
                min={1}
                max={255}
                value={alphaThreshold}
                onChange={e => setAlphaThreshold(Number(e.target.value))}
              />
            </label>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={dither} onChange={e => setDither(e.target.checked)} />
            Dithering
            <span style={{ fontSize: 11, color: '#888' }}>(smoother gradients)</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onCancel} style={buttonStyle}>
            Cancel
          </button>
          <button
            onClick={onOpenOriginal}
            disabled={!canOpenOriginal}
            title={
              canOpenOriginal ? 'Open without converting' : `Too large to edit unconverted (max ${MAX_ORIGINAL_SIZE}px)`
            }
            style={{
              ...buttonStyle,
              opacity: canOpenOriginal ? 1 : 0.4,
              cursor: canOpenOriginal ? 'pointer' : 'default',
            }}
          >
            Open original
          </button>
          <button
            onClick={() => onConvert(result)}
            style={{
              ...buttonStyle,
              border: '1px solid #4fc3f7',
              background: '#1a3a4a',
              color: '#4fc3f7',
              fontWeight: 600,
            }}
          >
            Convert
          </button>
        </div>
      </div>
    </div>
  )
}
