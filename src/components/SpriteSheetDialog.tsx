import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_CANVAS_SIZE } from './CanvasSizeControl'
import Dialog, { fieldStyle, labelText } from './Dialog'
import { checkerBackground } from './Timeline'

interface SpriteSheetDialogProps {
  image: ImageData
  fileName: string
  onImport: (frameWidth: number, frameHeight: number) => void
  onCancel: () => void
}

const PREVIEW_BOX = 400

/** Square frames along the long side when the sheet is a clean strip; otherwise the whole image. */
export function guessFrameSize(width: number, height: number): [number, number] {
  if (width > height && width % height === 0) return [height, height]
  if (height > width && height % width === 0) return [width, width]
  return [width, height]
}

/** Picks the frame size of a sprite sheet, with a grid over it that shows how it will be cut. */
export default function SpriteSheetDialog({ image, fileName, onImport, onCancel }: SpriteSheetDialogProps) {
  const [guessW, guessH] = guessFrameSize(image.width, image.height)
  const [frameW, setFrameW] = useState(Math.min(guessW, MAX_CANVAS_SIZE))
  const [frameH, setFrameH] = useState(Math.min(guessH, MAX_CANVAS_SIZE))
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const valid =
    Number.isInteger(frameW) &&
    Number.isInteger(frameH) &&
    frameW >= 1 &&
    frameH >= 1 &&
    frameW <= Math.min(image.width, MAX_CANVAS_SIZE) &&
    frameH <= Math.min(image.height, MAX_CANVAS_SIZE)
  const cols = valid ? Math.floor(image.width / frameW) : 0
  const rows = valid ? Math.floor(image.height / frameH) : 0

  // The sheet at the largest whole scale that fits, or shrunk when it is bigger than the box
  const scale = useMemo(() => {
    const fit = PREVIEW_BOX / Math.max(image.width, image.height)
    return fit >= 1 ? Math.floor(fit) : fit
  }, [image])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = Math.round(image.width * scale)
    const h = Math.round(image.height * scale)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const source = document.createElement('canvas')
    source.width = image.width
    source.height = image.height
    source.getContext('2d')!.putImageData(image, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, 0, 0, w, h)
    if (!valid) return
    ctx.strokeStyle = '#4fc3f7'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = 0; c <= cols; c++) {
      const x = Math.round(c * frameW * scale) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, rows * frameH * scale)
    }
    for (let r = 0; r <= rows; r++) {
      const y = Math.round(r * frameH * scale) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(cols * frameW * scale, y)
    }
    ctx.stroke()
  }, [image, scale, frameW, frameH, valid, cols, rows])

  const sizeField = (value: number, set: (n: number) => void, label: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelText}>{label}</span>
      <input
        type="number"
        min={1}
        max={MAX_CANVAS_SIZE}
        value={value || ''}
        onChange={e => set(Number(e.target.value))}
        style={{ ...fieldStyle, width: 80, borderColor: valid ? '#555' : '#d32f2f' }}
      />
    </label>
  )

  return (
    <Dialog
      title="Import sprite sheet"
      subtitle={`${fileName} · ${image.width}×${image.height}`}
      onCancel={onCancel}
      onConfirm={valid ? () => onImport(frameW, frameH) : null}
      confirmLabel="Import"
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {sizeField(frameW, setFrameW, 'Frame width')}
        {sizeField(frameH, setFrameH, 'Frame height')}
        <span style={{ fontSize: 12, color: valid ? '#888' : '#ef5350', paddingBottom: 6 }}>
          {valid
            ? `${cols} × ${rows} = up to ${cols * rows} frame${cols * rows === 1 ? '' : 's'} (empty ones at the end are skipped)`
            : `Frames must fit in the image and be at most ${MAX_CANVAS_SIZE}px`}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 8, borderRadius: 6, background: '#1e1e1e' }}>
        <canvas ref={canvasRef} style={{ background: checkerBackground, imageRendering: 'pixelated' }} />
      </div>
    </Dialog>
  )
}
