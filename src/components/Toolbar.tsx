import type { Tool } from '../types'

interface ToolbarProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  onClear: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

const tools: { id: Tool; label: string; symbol: string }[] = [
  { id: 'pencil', label: 'Pencil', symbol: '✏️' },
  { id: 'eraser', label: 'Eraser', symbol: '🧹' },
  { id: 'fill', label: 'Fill', symbol: '💧' },
  { id: 'picker', label: 'Picker', symbol: '💉' },
  { id: 'shade', label: 'Shade', symbol: '🌗' },
  { id: 'selection', label: 'Select', symbol: '👉' },
  { id: 'select', label: 'Hand', symbol: '✋' },
]

export default function Toolbar({ activeTool, onToolChange, zoom, onZoomChange, onClear, onUndo, onRedo, canUndo, canRedo }: ToolbarProps) {
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

  return (
    <div
      style={{
        width: 48,
        background: '#2d2d2d',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        gap: 4,
        borderRight: '1px solid #444',
      }}
    >
      {tools.map(t => (
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
          {t.symbol}
        </button>
      ))}

      <div style={{ width: 36, height: 1, background: '#444', margin: '8px 0' }} />

      <button title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} style={{ ...btnBase, opacity: canUndo ? 1 : 0.3 }}>
        ↶
      </button>
      <button title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} style={{ ...btnBase, opacity: canRedo ? 1 : 0.3 }}>
        ↷
      </button>

      <div style={{ width: 36, height: 1, background: '#444', margin: '8px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button title="Zoom in" onClick={() => onZoomChange(zoom + 4)} style={{ ...btnBase, height: 28, fontSize: 16, border: '1px solid #555' }}>
          +
        </button>
        <span style={{ color: '#aaa', fontSize: 11, textAlign: 'center' }}>{zoom}</span>
        <button title="Zoom out" onClick={() => onZoomChange(zoom - 4)} style={{ ...btnBase, height: 28, fontSize: 16, border: '1px solid #555' }}>
          −
        </button>
      </div>

      <div style={{ marginTop: 'auto' }}>
        <button title="Clear canvas" onClick={onClear} style={{ ...btnBase, border: '1px solid #d32f2f', color: '#d32f2f', fontSize: 20 }}>
          ✕
        </button>
      </div>
    </div>
  )
}
