import { useRef, useState } from 'react'
import { ArrowLeftRight, FileDown, FileUp, Lock, LockOpen, Plus, RotateCcw, WandSparkles } from 'lucide-react'
import ColorPicker from './ColorPicker'
import { PALETTE_EXTENSIONS } from '../utils/palette'
import { tip } from './Tooltip'

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
  onImportFile: (file: File) => void
  onExport: () => void
  locked: boolean
  onToggleLock: () => void
  /** Maps the canvas, or the selection, to the palette colors */
  onReduce: () => void
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

const swatchBox: React.CSSProperties = {
  position: 'absolute',
  width: 30,
  height: 30,
  padding: 0,
  borderRadius: 4,
  border: '2px solid #999',
  boxShadow: '0 0 0 1px #000',
  cursor: 'pointer',
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
  onImportFile,
  onExport,
  locked,
  onToggleLock,
  onReduce,
}: ColorPaletteProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Primary in front, secondary behind it, as in most editors */}
        <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
          <button
            {...tip('Secondary color: right click draws with it. Click to swap', 'X')}
            onClick={onSwap}
            style={{ ...swatchBox, right: 0, bottom: 0, background: secondaryColor }}
          />
          <div
            {...tip('Primary color: left click draws with it')}
            style={{ ...swatchBox, left: 0, top: 0, background: primaryColor, borderColor: '#fff' }}
          />
        </div>
        <button {...tip('Swap colors', 'X')} onClick={onSwap} style={iconBtn}>
          <ArrowLeftRight size={14} />
        </button>
      </div>

      <ColorPicker color={primaryColor} onChange={onPrimaryChange} />

      <span
        {...tip(paletteName)}
        style={{
          color: '#aaa',
          fontSize: 11,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: -6,
        }}
      >
        {paletteName} <span style={{ color: '#666' }}>({paletteColors.length})</span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          {...tip(inPalette ? 'The primary color is already in the palette' : 'Add the primary color to the palette')}
          onClick={onAddColor}
          disabled={inPalette}
          style={{ ...iconBtn, opacity: inPalette ? 0.3 : 1 }}
        >
          <Plus size={14} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={PALETTE_EXTENSIONS.map(ext => '.' + ext).join(',')}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onImportFile(file)
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />
        <button
          {...tip('Import palette (.gpl GIMP / Aseprite, .hex Lospec)')}
          onClick={() => fileInputRef.current?.click()}
          style={iconBtn}
        >
          <FileUp size={14} />
        </button>
        <button {...tip('Export palette (.gpl or .hex)')} onClick={onExport} style={iconBtn}>
          <FileDown size={14} />
        </button>
        <button
          {...tip('Reset to the default palette')}
          onClick={() => {
            if (window.confirm('Replace the current palette with the default one?')) onResetPalette()
          }}
          style={iconBtn}
        >
          <RotateCcw size={14} />
        </button>
        <button
          {...tip(
            locked
              ? 'Unlock: draw with any color'
              : 'Lock to the palette: everything drawn uses the nearest palette color',
          )}
          onClick={onToggleLock}
          style={{
            ...iconBtn,
            border: locked ? '1px solid #4fc3f7' : iconBtn.border,
            background: locked ? '#1a3a4a' : iconBtn.background,
            color: locked ? '#4fc3f7' : iconBtn.color,
          }}
        >
          {locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <button
          {...tip('Reduce the canvas (or the selection) to the palette colors')}
          onClick={onReduce}
          style={iconBtn}
        >
          <WandSparkles size={14} />
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
            {...tip(`${color}\nLeft: primary · Right: secondary\nCtrl+click: remove · Drag: reorder`)}
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
