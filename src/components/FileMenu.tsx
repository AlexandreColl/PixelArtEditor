import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FilePlus, FolderOpen, Grid2x2, ImageDown, ImagePlus, Save } from 'lucide-react'

interface FileMenuProps {
  onNew: () => void
  onOpen: () => void
  /** A picked image that always goes through the pixel art conversion */
  onImportAsPixelArt: (file: File) => void
  /** A picked image to cut into frames */
  onImportSpriteSheet: (file: File) => void
  onSave: () => void
  onExport: () => void
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  background: 'transparent',
  color: '#e0e0e0',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const shortcutStyle: React.CSSProperties = { marginLeft: 'auto', paddingLeft: 24, color: '#888', fontSize: 11 }

export default function FileMenu({
  onNew,
  onOpen,
  onImportAsPixelArt,
  onImportSpriteSheet,
  onSave,
  onExport,
}: FileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Both imports pick a file with the same input; this says which one asked
  const importModeRef = useRef<'pixel-art' | 'sprite-sheet'>('pixel-art')

  const pickImage = (mode: 'pixel-art' | 'sprite-sheet') => {
    importModeRef.current = mode
    fileInputRef.current?.click()
  }

  // Close on a click anywhere else or on Escape
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  /** Runs a menu entry and closes the menu. */
  const pick = (action: () => void) => () => {
    setIsOpen(false)
    action()
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/gif,image/jpeg"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) (importModeRef.current === 'sprite-sheet' ? onImportSpriteSheet : onImportAsPixelArt)(file)
          e.target.value = ''
        }}
        style={{ display: 'none' }}
      />

      <button
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px 4px 10px',
          borderRadius: 4,
          border: isOpen ? '1px solid #4fc3f7' : '1px solid #555',
          background: isOpen ? '#3a3a3a' : 'transparent',
          color: '#e0e0e0',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        File <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 100,
            minWidth: 220,
            padding: '4px 0',
            background: '#2d2d2d',
            border: '1px solid #555',
            borderRadius: 6,
            boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
          }}
        >
          <button role="menuitem" style={itemStyle} onClick={pick(onNew)}>
            <FilePlus size={15} /> New canvas (32x32)
          </button>
          <button role="menuitem" style={itemStyle} onClick={pick(onOpen)}>
            <FolderOpen size={15} /> Open… <span style={shortcutStyle}>Ctrl+O</span>
          </button>
          <button role="menuitem" style={itemStyle} onClick={pick(() => pickImage('pixel-art'))}>
            <ImagePlus size={15} /> Import image as pixel art…
          </button>
          <button role="menuitem" style={itemStyle} onClick={pick(() => pickImage('sprite-sheet'))}>
            <Grid2x2 size={15} /> Import sprite sheet…
          </button>
          <div style={{ height: 1, background: '#444', margin: '4px 0' }} />
          <button role="menuitem" style={itemStyle} onClick={pick(onSave)}>
            <Save size={15} /> Save <span style={shortcutStyle}>Ctrl+S</span>
          </button>
          <button role="menuitem" style={itemStyle} onClick={pick(onExport)}>
            <ImageDown size={15} /> Export… <span style={shortcutStyle}>Ctrl+E</span>
          </button>
        </div>
      )}
    </div>
  )
}
