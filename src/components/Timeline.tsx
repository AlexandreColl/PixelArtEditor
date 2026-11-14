import { memo, useEffect, useRef, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import type { PixelData } from '../types'
import { tip } from './Tooltip'
import { drawPixels } from '../utils/png'

interface TimelineProps {
  frames: PixelData[]
  currentFrame: number
  onSelectFrame: (index: number) => void
  onAddFrame: () => void
  onDuplicateFrame: () => void
  onDeleteFrame: () => void
  onMoveFrame: (from: number, to: number) => void
  /** Extra controls at the left of the strip */
  children?: React.ReactNode
}

const THUMB_SIZE = 44

export const iconBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  border: '1px solid #555',
  background: 'transparent',
  color: '#ccc',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
}

export const checkerBackground = 'repeating-conic-gradient(#f0f0f0 0% 25%, #cfcfcf 0% 50%) 50% / 8px 8px'

/** A frame drawn at the largest whole scale that fits the box. Redraws only when that frame changes. */
export const FrameImage = memo(function FrameImage({ frame, box }: { frame: PixelData; box: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawPixels(ref.current, frame.pixels, frame.width, frame.height)
  }, [frame])
  const scale = Math.max(1, Math.floor(box / Math.max(frame.width, frame.height)))
  // Frames bigger than the box are shrunk to fit rather than cropped
  const fit = Math.min(1, box / (Math.max(frame.width, frame.height) * scale))
  return (
    <canvas
      ref={ref}
      style={{
        width: frame.width * scale * fit,
        height: frame.height * scale * fit,
        imageRendering: 'pixelated',
        background: checkerBackground,
      }}
    />
  )
})

/** The strip of frames under the canvas: pick, add, duplicate, delete and drag to reorder. */
export default function Timeline({
  frames,
  currentFrame,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onMoveFrame,
  children,
}: TimelineProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // Keep the current frame in view when it changes from the keyboard or an undo
  useEffect(() => {
    stripRef.current?.children[currentFrame]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentFrame])

  const endDrag = () => {
    setDragFrom(null)
    setDragOver(null)
  }

  return (
    <div
      style={{
        height: THUMB_SIZE + 26,
        flexShrink: 0,
        background: '#252525',
        borderTop: '1px solid #444',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
      }}
    >
      {children}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button {...tip('New empty frame')} onClick={onAddFrame} style={iconBtn}>
            <Plus size={14} />
          </button>
          <button {...tip('Duplicate frame')} onClick={onDuplicateFrame} style={iconBtn}>
            <Copy size={14} />
          </button>
          <button
            {...tip(frames.length > 1 ? 'Delete frame' : 'The only frame cannot be deleted')}
            onClick={onDeleteFrame}
            disabled={frames.length <= 1}
            style={{ ...iconBtn, opacity: frames.length > 1 ? 1 : 0.3 }}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#888', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          Frame {currentFrame + 1} / {frames.length}
        </span>
      </div>

      <div
        ref={stripRef}
        role="listbox"
        aria-label="Frames"
        style={{ flex: 1, display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 2px', alignItems: 'center' }}
      >
        {frames.map((frame, i) => (
          <div
            // Position, not identity: two frames can be the same object right after a duplicate
            key={i}
            role="option"
            aria-selected={i === currentFrame}
            {...tip(`Frame ${i + 1}\nDrag to reorder`)}
            draggable
            onClick={() => onSelectFrame(i)}
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move'
              setDragFrom(i)
            }}
            onDragOver={e => {
              if (dragFrom === null) return
              e.preventDefault()
              setDragOver(i)
            }}
            onDrop={e => {
              e.preventDefault()
              if (dragFrom !== null) onMoveFrame(dragFrom, i)
              endDrag()
            }}
            onDragEnd={endDrag}
            style={{
              position: 'relative',
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              background: '#1e1e1e',
              border:
                dragOver === i && dragFrom !== i
                  ? '2px dashed #fff'
                  : i === currentFrame
                    ? '2px solid #4fc3f7'
                    : '2px solid #444',
              opacity: dragFrom === i ? 0.4 : 1,
              cursor: 'pointer',
            }}
          >
            <FrameImage frame={frame} box={THUMB_SIZE - 8} />
            <span
              style={{
                position: 'absolute',
                left: 2,
                bottom: 0,
                fontSize: 9,
                color: '#fff',
                textShadow: '0 0 2px #000, 0 0 2px #000',
                pointerEvents: 'none',
              }}
            >
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
