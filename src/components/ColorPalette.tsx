import { useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'

interface ColorPaletteProps {
  primaryColor: string
  secondaryColor: string
  onPrimaryChange: (color: string) => void
  onSecondaryChange: (color: string) => void
  onSwap: () => void
  paletteName: string
  paletteColors: string[]
  /** Adds the primary color to the palette */
  onAddColor: () => void
  onRemoveColor: (color: string) => void
  onMoveColor: (from: number, to: number) => void
  onResetPalette: () => void
}

const iconBtn: React.CSSProperties = {
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
}

export default function ColorPalette({
  primaryColor,
  secondaryColor,
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
  paletteName,
  paletteColors,
  onAddColor,
  onRemoveColor,
  onMoveColor,
  onResetPalette,
}: ColorPaletteProps) {
  const [showPicker, setShowPicker] = useState(false)
  // Swatch being dragged to reorder, and the one under the pointer
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const inPalette = paletteColors.includes(primaryColor)

  return (
    <div
      style={{
        width: 200,
        background: '#2d2d2d',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderLeft: '1px solid #444',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div
          title="Primary color (click to edit)"
          style={{
            width: 32,
            height: 32,
            background: primaryColor,
            border: '2px solid #fff',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          onClick={() => setShowPicker(!showPicker)}
        />
        <div
          title="Secondary color (click to swap)"
          style={{
            width: 20,
            height: 20,
            background: secondaryColor,
            border: '2px solid #999',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          onClick={onSwap}
        />
        <span style={{ color: '#aaa', fontSize: 11, cursor: 'pointer' }} onClick={onSwap}>
          Swap
        </span>
      </div>

      {showPicker && (
        <input
          type="color"
          value={primaryColor}
          onChange={e => onPrimaryChange(e.target.value)}
          style={{ width: '100%', height: 40, border: 'none', padding: 0, cursor: 'pointer' }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          title={paletteName}
          style={{
            flex: 1,
            color: '#aaa',
            fontSize: 11,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {paletteName} <span style={{ color: '#666' }}>({paletteColors.length})</span>
        </span>
        <button
          title={inPalette ? 'The primary color is already in the palette' : 'Add the primary color to the palette'}
          onClick={onAddColor}
          disabled={inPalette}
          style={{ ...iconBtn, opacity: inPalette ? 0.3 : 1 }}
        >
          <Plus size={14} />
        </button>
        <button
          title="Reset to the default palette"
          onClick={() => {
            if (window.confirm('Replace the current palette with the default one?')) onResetPalette()
          }}
          style={iconBtn}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 4,
          overflowY: 'auto',
          alignContent: 'start',
          minHeight: 0,
        }}
      >
        {paletteColors.map((color, i) => (
          <div
            key={color}
            title={`${color}\nLeft: primary · Right: secondary\nCtrl+click: remove · Drag: reorder`}
            draggable
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move'
              setDragFrom(i)
            }}
            onDragOver={e => {
              if (dragFrom === null) return
              e.preventDefault()
              setDragOver(i)
            }}
            onDragLeave={() => setDragOver(prev => (prev === i ? null : prev))}
            onDrop={e => {
              e.preventDefault()
              if (dragFrom !== null) onMoveColor(dragFrom, i)
              setDragFrom(null)
              setDragOver(null)
            }}
            onDragEnd={() => {
              setDragFrom(null)
              setDragOver(null)
            }}
            style={{
              width: '100%',
              aspectRatio: '1',
              background: color,
              border:
                dragOver === i && dragFrom !== i
                  ? '2px dashed #fff'
                  : primaryColor === color
                    ? '2px solid #4fc3f7'
                    : secondaryColor === color
                      ? '2px solid #999'
                      : '2px solid transparent',
              borderRadius: 3,
              cursor: 'pointer',
              opacity: dragFrom === i ? 0.4 : 1,
            }}
            onClick={e => {
              if (e.ctrlKey || e.metaKey) onRemoveColor(color)
              else onPrimaryChange(color)
            }}
            onContextMenu={e => {
              e.preventDefault()
              onSecondaryChange(color)
            }}
          />
        ))}
      </div>
    </div>
  )
}
