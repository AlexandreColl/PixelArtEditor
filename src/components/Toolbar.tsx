import type { Tool } from '../types'
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  Blend,
  MousePointer,
  Grid3x3,
  Maximize,
  Slash,
  Square,
  Circle,
  FlipHorizontal,
  FlipVertical,
} from 'lucide-react'

interface ToolbarProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  onFit: () => void
  showGrid: boolean
  onToggleGrid: () => void
  shapeFilled: boolean
  onToggleShapeFilled: () => void
  mirrorX: boolean
  mirrorY: boolean
  onToggleMirrorX: () => void
  onToggleMirrorY: () => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  onClear: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

const tools: { id: Tool; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'fill', label: 'Fill', icon: PaintBucket },
  { id: 'picker', label: 'Picker', icon: Pipette },
  { id: 'line', label: 'Line', icon: Slash },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'shade', label: 'Shade', icon: Blend },
  { id: 'selection', label: 'Select', icon: MousePointer },
]

const btnBase: React.CSSProperties = {
  width: 36,
  height: 36,
  border: '2px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ccc',
  lineHeight: 1,
}

const toggleBtn = (on: boolean): React.CSSProperties => ({
  ...btnBase,
  height: 28,
  border: on ? '1px solid #4fc3f7' : '1px solid #555',
  background: on ? '#3a3a3a' : 'transparent',
  color: on ? '#4fc3f7' : '#ccc',
})

export default function Toolbar({
  activeTool,
  onToolChange,
  zoom,
  onZoomChange,
  onFit,
  showGrid,
  onToggleGrid,
  shapeFilled,
  onToggleShapeFilled,
  mirrorX,
  mirrorY,
  onToggleMirrorX,
  onToggleMirrorY,
  brushSize,
  onBrushSizeChange,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ToolbarProps) {
  return (
    <div
      style={{
        width: 88,
        background: '#2d2d2d',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        gap: 4,
        borderRight: '1px solid #444',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 36px)', gap: 4 }}>
        {tools.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              title={t.label}
              onClick={() => onToolChange(t.id)}
              style={{
                ...btnBase,
                border: activeTool === t.id ? '2px solid #4fc3f7' : '2px solid transparent',
                background: activeTool === t.id ? '#3a3a3a' : 'transparent',
              }}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </div>

      <div style={{ width: 76, height: 1, background: '#444', margin: '6px 0' }} />

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          title="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canUndo}
          style={{ ...btnBase, opacity: canUndo ? 1 : 0.3 }}
        >
          ↶
        </button>
        <button
          title="Redo (Ctrl+Shift+Z)"
          onClick={onRedo}
          disabled={!canRedo}
          style={{ ...btnBase, opacity: canRedo ? 1 : 0.3 }}
        >
          ↷
        </button>
      </div>

      <div style={{ width: 76, height: 1, background: '#444', margin: '6px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            title="Zoom out"
            onClick={() => onZoomChange(zoom - 4)}
            style={{ ...btnBase, height: 28, fontSize: 16, border: '1px solid #555' }}
          >
            −
          </button>
          <button
            title="Zoom in"
            onClick={() => onZoomChange(zoom + 4)}
            style={{ ...btnBase, height: 28, fontSize: 16, border: '1px solid #555' }}
          >
            +
          </button>
        </div>
        <span style={{ color: '#aaa', fontSize: 11, textAlign: 'center' }}>{zoom}x</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            title="Fit to window (Ctrl+0)"
            onClick={onFit}
            style={{ ...btnBase, height: 28, border: '1px solid #555' }}
          >
            <Maximize size={16} />
          </button>
          <button
            title="Toggle grid (G)"
            onClick={onToggleGrid}
            style={{
              ...btnBase,
              height: 28,
              border: showGrid ? '1px solid #4fc3f7' : '1px solid #555',
              background: showGrid ? '#3a3a3a' : 'transparent',
              color: showGrid ? '#4fc3f7' : '#ccc',
            }}
          >
            <Grid3x3 size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          title="Mirror horizontally: draw symmetric left and right (pencil, eraser, shapes)"
          onClick={onToggleMirrorX}
          style={toggleBtn(mirrorX)}
        >
          <FlipHorizontal size={16} />
        </button>
        <button
          title="Mirror vertically: draw symmetric top and bottom (pencil, eraser, shapes)"
          onClick={onToggleMirrorY}
          style={toggleBtn(mirrorY)}
        >
          <FlipVertical size={16} />
        </button>
      </div>

      {(activeTool === 'rect' || activeTool === 'ellipse') && (
        <label
          title="Fill the shape instead of drawing only its outline"
          style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#aaa', fontSize: 11, cursor: 'pointer' }}
        >
          <input type="checkbox" checked={shapeFilled} onChange={onToggleShapeFilled} />
          Filled
        </label>
      )}

      {(activeTool === 'pencil' ||
        activeTool === 'eraser' ||
        activeTool === 'line' ||
        ((activeTool === 'rect' || activeTool === 'ellipse') && !shapeFilled)) && (
        <div style={{ width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: 76, height: 1, background: '#444', margin: '6px 0' }} />
          <span style={{ color: '#aaa', fontSize: 11 }}>
            Brush <b style={{ color: '#e0e0e0', fontSize: 13 }}>{brushSize}</b>
          </span>
          <input
            type="range"
            min={1}
            max={16}
            value={brushSize}
            onChange={e => onBrushSizeChange(Number(e.target.value))}
            style={{ width: 60, height: 4, accentColor: '#4fc3f7', cursor: 'pointer' }}
          />
        </div>
      )}

      <div style={{ marginTop: 'auto' }}>
        <button
          title="Clear canvas"
          onClick={onClear}
          style={{ ...btnBase, border: '1px solid #d32f2f', color: '#d32f2f', fontSize: 20 }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
