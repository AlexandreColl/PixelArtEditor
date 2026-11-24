import { memo, useEffect, useRef, useState } from 'react'
import { Copy, Layers, Plus, Trash2 } from 'lucide-react'
import type { PixelData } from '../types'
import { tip } from './Tooltip'
import Button from './Button'
import { drawPixels } from '../utils/png'
import { type FrameDuration, MAX_DURATION, MIN_DURATION } from '../utils/timing'

interface TimelineProps {
  frames: PixelData[]
  currentFrame: number
  onSelectFrame: (index: number) => void
  onAddFrame: () => void
  onDuplicateFrame: () => void
  onDeleteFrame: () => void
  onMoveFrame: (from: number, to: number) => void
  onionSkin: boolean
  onToggleOnionSkin: () => void
  /** durations[frame] in milliseconds, or null to follow fps */
  durations: FrameDuration[]
  fps: number
  /** A typed duration for a frame; an empty value makes it follow fps again */
  onDurationChange: (index: number, duration: string) => void
  /** Extra controls at the left of the strip */
  children?: React.ReactNode
}

const THUMB_SIZE = 44
/** Tall enough for the animation preview to show the default 32x32 canvas at 2x */
export const TIMELINE_HEIGHT = 88

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

/** How long the current frame shows. Empty, it follows the animation speed, shown as the placeholder. */
function FrameDurationField({
  duration,
  fps,
  onChange,
}: {
  duration: FrameDuration
  fps: number
  onChange: (value: string) => void
}) {
  const [text, setText] = useState(duration === null ? '' : String(duration))
  // Follow undo and the other frame operations
  const [shown, setShown] = useState(duration)
  if (duration !== shown) {
    setShown(duration)
    setText(duration === null ? '' : String(duration))
  }
  const commit = () => {
    if (text.trim() === '' ? duration !== null : Number(text) !== duration) onChange(text)
    else setText(duration === null ? '' : String(duration))
  }
  return (
    <label
      {...tip(`How long this frame shows, in milliseconds.\nEmpty: follows the speed (${fps} fps)`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        fontSize: 11,
        color: 'var(--text-subtle)',
      }}
    >
      <input
        type="number"
        aria-label="Frame duration in milliseconds"
        min={MIN_DURATION}
        max={MAX_DURATION}
        step={10}
        placeholder={String(Math.round(1000 / fps))}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setText(duration === null ? '' : String(duration))
        }}
        style={{
          width: 54,
          padding: '1px 4px',
          borderRadius: 4,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: duration === null ? 'var(--text-muted)' : 'var(--accent)',
          fontSize: 11,
        }}
      />
      ms
    </label>
  )
}

/** The strip of frames under the canvas: pick, add, duplicate, delete and drag to reorder. */
export default function Timeline({
  frames,
  currentFrame,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onMoveFrame,
  onionSkin,
  onToggleOnionSkin,
  durations,
  fps,
  onDurationChange,
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
        height: TIMELINE_HEIGHT,
        flexShrink: 0,
        background: '#252525',
        borderTop: '1px solid var(--divider)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
      }}
    >
      {children}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button icon {...tip('New empty frame')} onClick={onAddFrame}>
            <Plus size={14} />
          </Button>
          <Button icon {...tip('Duplicate frame')} onClick={onDuplicateFrame}>
            <Copy size={14} />
          </Button>
          <Button
            icon
            {...tip(frames.length > 1 ? 'Delete frame' : 'The only frame cannot be deleted')}
            onClick={onDeleteFrame}
            disabled={frames.length <= 1}
          >
            <Trash2 size={14} />
          </Button>
          <Button
            icon
            {...tip(onionSkin ? 'Hide the previous frame' : 'Onion skin: show the previous frame under this one')}
            aria-pressed={onionSkin}
            onClick={onToggleOnionSkin}
          >
            <Layers size={14} />
          </Button>
        </div>
        <span
          style={{ fontSize: 11, color: 'var(--text-subtle)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
        >
          Frame {currentFrame + 1} / {frames.length}
        </span>
        <FrameDurationField
          key={currentFrame}
          duration={durations[currentFrame] ?? null}
          fps={fps}
          onChange={value => onDurationChange(currentFrame, value)}
        />
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
              background: 'var(--bg)',
              border:
                dragOver === i && dragFrom !== i
                  ? '2px dashed #fff'
                  : i === currentFrame
                    ? '2px solid var(--accent)'
                    : '2px solid var(--divider)',
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
            {durations[i] != null && (
              <span
                style={{
                  position: 'absolute',
                  right: 2,
                  top: 0,
                  fontSize: 9,
                  color: 'var(--accent)',
                  textShadow: '0 0 2px #000, 0 0 2px #000',
                  pointerEvents: 'none',
                }}
              >
                {durations[i]}ms
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
