import { useRef, useState } from 'react'
import { ArrowLeftRight, FileDown, FileUp, Lock, LockOpen, Plus, RotateCcw, WandSparkles } from 'lucide-react'
import ColorPicker from './ColorPicker'
import { PALETTE_EXTENSIONS } from '../utils/palette'
import { tip } from './Tooltip'
import Button from './Button'

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
        background: 'var(--surface)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderLeft: '1px solid var(--divider)',
        flex: 1,
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
        <Button icon {...tip('Swap colors', 'X')} onClick={onSwap}>
          <ArrowLeftRight size={14} />
        </Button>
      </div>

      <ColorPicker color={primaryColor} onChange={onPrimaryChange} />

      <span
        {...tip(paletteName)}
        style={{
          color: 'var(--text-muted)',
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
        <Button
          icon
          {...tip(inPalette ? 'The primary color is already in the palette' : 'Add the primary color to the palette')}
          onClick={onAddColor}
          disabled={inPalette}
        >
          <Plus size={14} />
        </Button>
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
        <Button
          icon
          {...tip('Import palette (.gpl GIMP / Aseprite, .hex Lospec)')}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp size={14} />
        </Button>
        <Button icon {...tip('Export palette (.gpl or .hex)')} onClick={onExport}>
          <FileDown size={14} />
        </Button>
        <Button
          icon
          {...tip('Reset to the default palette')}
          onClick={() => {
            if (window.confirm('Replace the current palette with the default one?')) onResetPalette()
          }}
        >
          <RotateCcw size={14} />
        </Button>
        <Button
          icon
          aria-pressed={locked}
          {...tip(
            locked
              ? 'Unlock: draw with any color'
              : 'Lock to the palette: everything drawn uses the nearest palette color',
          )}
          onClick={onToggleLock}
        >
          {locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </Button>
        <Button icon {...tip('Reduce the canvas (or the selection) to the palette colors')} onClick={onReduce}>
          <WandSparkles size={14} />
        </Button>
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
                    ? '2px solid var(--accent)'
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
