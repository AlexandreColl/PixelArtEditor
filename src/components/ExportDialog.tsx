import { useMemo, useState } from 'react'
import type { PixelData } from '../types'
import { EXPORT_SCALES } from '../utils/png'
import { framesToSheet } from '../utils/spriteSheet'
import Dialog, { fieldStyle, labelText } from './Dialog'
import { FrameImage } from './Timeline'

export type ExportKind = 'frame' | 'sheet' | 'gif'

export interface ExportOptions {
  kind: ExportKind
  scale: number
  /** Frames per row of a sprite sheet */
  columns: number
}

interface ExportDialogProps {
  frames: PixelData[]
  currentFrame: number
  fps: number
  onExport: (options: ExportOptions) => void
  onCancel: () => void
}

const KINDS: { kind: ExportKind; label: string; hint: string }[] = [
  { kind: 'frame', label: 'Current frame', hint: 'PNG of the frame being edited' },
  { kind: 'sheet', label: 'Sprite sheet', hint: 'PNG with every frame, for game engines' },
  { kind: 'gif', label: 'Animated GIF', hint: 'Plays anywhere; no partial transparency' },
]

const PREVIEW_BOX = 280

export default function ExportDialog({ frames, currentFrame, fps, onExport, onCancel }: ExportDialogProps) {
  const [kind, setKind] = useState<ExportKind>(frames.length > 1 ? 'sheet' : 'frame')
  const [scale, setScale] = useState(1)
  // One row by default, which every engine can read
  const [columns, setColumns] = useState(frames.length)
  const { width, height } = frames[0]

  const cols = Math.max(1, Math.min(columns || 1, frames.length))
  const rows = Math.ceil(frames.length / cols)

  const preview = useMemo(() => {
    if (kind !== 'sheet') return frames[currentFrame]
    return framesToSheet(
      frames.map(f => f.pixels),
      width,
      height,
      cols,
    )
  }, [kind, frames, currentFrame, width, height, cols])

  const outW = preview.width * scale
  const outH = preview.height * scale

  return (
    <Dialog
      title="Export"
      subtitle={`${frames.length} frame${frames.length === 1 ? '' : 's'} · ${width}×${height}`}
      onCancel={onCancel}
      onConfirm={() => onExport({ kind, scale, columns: cols })}
      confirmLabel="Export…"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="radiogroup" aria-label="Format">
        {KINDS.map(k => (
          <label key={k.kind} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
            <input type="radio" name="export-kind" checked={kind === k.kind} onChange={() => setKind(k.kind)} />
            {k.label}
            <span style={{ fontSize: 11, color: '#888' }}>{k.hint}</span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelText}>Scale</span>
          <select value={scale} onChange={e => setScale(Number(e.target.value))} style={fieldStyle}>
            {EXPORT_SCALES.map(s => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </label>

        {kind === 'sheet' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelText}>Columns</span>
            <input
              type="number"
              min={1}
              max={frames.length}
              value={columns}
              onChange={e => setColumns(Number(e.target.value))}
              style={{ ...fieldStyle, width: 70 }}
            />
          </label>
        )}

        <span style={{ fontSize: 12, color: '#888', paddingBottom: 6 }}>
          {kind === 'sheet' && `${cols} × ${rows} · `}
          {kind === 'gif' && `${frames.length} frames at ${fps} fps · `}
          {outW}×{outH} px
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 80,
          padding: 8,
          borderRadius: 6,
          background: '#1e1e1e',
        }}
      >
        <FrameImage frame={preview} box={PREVIEW_BOX} />
      </div>
    </Dialog>
  )
}
