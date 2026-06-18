import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import ColorPalette from './components/ColorPalette'
import AIChat from './components/AIChat'
import { useEditor } from './hooks/useEditor'
import type { PixelData } from './types'
import { Save, FolderOpen, BotMessageSquare } from 'lucide-react'

function pixelsToPngDataUrl(pixels: string[][], width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ctx.fillStyle = pixels[y][x]
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return canvas.toDataURL('image/png')
}

async function savePngFile(pixels: string[][], width: number, height: number, filePath: string) {
  const dataUrl = pixelsToPngDataUrl(pixels, width, height)
  await invoke('save_png_file', { path: filePath, base64Data: dataUrl.split(',')[1] })
}

function loadImageFile(file: File): Promise<PixelData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      const pixels: string[][] = []
      for (let y = 0; y < img.height; y++) {
        const row: string[] = []
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4
          const r = imageData.data[i]
          const g = imageData.data[i + 1]
          const b = imageData.data[i + 2]
          const a = imageData.data[i + 3]
          row.push(a === 0 ? 'rgba(0,0,0,0)' : `rgba(${r},${g},${b},${a / 255})`)
        }
        pixels.push(row)
      }
      resolve({ width: img.width, height: img.height, pixels })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#323232',
        color: '#fff',
        padding: '10px 24px',
        borderRadius: 8,
        fontSize: 13,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {message}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid #555',
  background: 'transparent',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: 13,
}
const btnAccent: React.CSSProperties = {
  padding: '4px 14px',
  borderRadius: 6,
  border: '1px solid #4fc3f7',
  background: '#1a3a4a',
  color: '#4fc3f7',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
}

export default function App() {
  const {
    state,
    canUndo,
    canRedo,
    setTool,
    setPrimaryColor,
    setSecondaryColor,
    setZoom,
    setBrushSize,
    paintBrush,
    fillRegion,
    shadePixel,
    pickColor,
    resizeCanvas,
    clearCanvas,
    importPixels,
    undo,
    redo,
  } = useEditor()

  const [aiOpen, setAiOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false })
  const filePathRef = useRef<string | null>(null)
  const fileNameRef = useRef('untitled')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sizeWRef = useRef(state.pixelData.width)
  const sizeHRef = useRef(state.pixelData.height)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pixelDataRef = useRef(state.pixelData)

  pixelDataRef.current = state.pixelData

  const extractFullCanvasAsBase64 = useCallback((): string => {
    const pd = pixelDataRef.current
    const c = document.createElement('canvas')
    c.width = pd.width
    c.height = pd.height
    const ctx = c.getContext('2d')!
    for (let y = 0; y < pd.height; y++) {
      for (let x = 0; x < pd.width; x++) {
        ctx.fillStyle = pd.pixels[y][x]
        ctx.fillRect(x, y, 1, 1)
      }
    }
    return c.toDataURL('image/png').split(',')[1] || ''
  }, [])

  const applyFullPixels = useCallback(
    (pixels: string[][]) => {
      const pd = pixelDataRef.current
      const h = Math.min(pixels.length, pd.height)
      const w = Math.min(pixels[0]?.length ?? pd.width, pd.width)
      const merged = pd.pixels.map(row => [...row])
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          merged[y][x] = pixels[y][x]
        }
      }
      importPixels(merged, pd.width, pd.height)
    },
    [importPixels],
  )

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true })
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast({ message: '', visible: false }), 2500)
  }, [])

  const doSavePng = useCallback(
    async (filePath: string) => {
      try {
        await savePngFile(state.pixelData.pixels, state.pixelData.width, state.pixelData.height, filePath)
        filePathRef.current = filePath
        const name =
          filePath
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^/.]+$/, '') || 'untitled'
        fileNameRef.current = name
        showToast(`Saved as ${name}.png`)
      } catch (err) {
        showToast('Save failed')
        console.error(err)
      }
    },
    [state.pixelData, showToast],
  )

  const handleSave = useCallback(async () => {
    if (filePathRef.current) {
      await doSavePng(filePathRef.current)
    } else {
      const fp = await save({
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        defaultPath: `${fileNameRef.current}.png`,
      })
      if (fp) await doSavePng(fp)
    }
  }, [doSavePng])

  const handleOpen = useCallback(async () => {
    try {
      const fp = await open({
        filters: [{ name: 'Images', extensions: ['png', 'gif', 'jpeg', 'jpg'] }],
        multiple: false,
        fileAccessMode: 'scoped',
      })
      if (!fp) return

      const data = await readFile(fp)
      const blob = new Blob([data])
      const file = new File([blob], fp.split(/[\\/]/).pop() || 'image.png')
      const pixelData = await loadImageFile(file)
      importPixels(pixelData.pixels, pixelData.width, pixelData.height)
      filePathRef.current = fp
      const name =
        fp
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^/.]+$/, '') || 'untitled'
      fileNameRef.current = name
    } catch {
      showToast('Could not open image')
    }
  }, [importPixels, showToast])

  const handleOpenLegacy = useCallback(
    async (file: File) => {
      try {
        const data = await loadImageFile(file)
        importPixels(data.pixels, data.width, data.height)
        const name = file.name.replace(/\.[^/.]+$/, '')
        fileNameRef.current = name
        filePathRef.current = null
      } catch {
        showToast('Could not open image')
      }
    },
    [importPixels, showToast],
  )

  const zoomRef = useRef(state.zoom)
  zoomRef.current = state.zoom
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  const handleOpenRef = useRef(handleOpen)
  handleOpenRef.current = handleOpen

  useEffect(() => {
    const handlePick = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail === 'string') setPrimaryColor(detail)
    }
    const handleZoom = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail === 'number') setZoom(zoomRef.current + detail * 4)
    }
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveRef.current()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        handleOpenRef.current()
      }
    }
    window.addEventListener('pick-color', handlePick)
    window.addEventListener('canvas-zoom', handleZoom)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pick-color', handlePick)
      window.removeEventListener('canvas-zoom', handleZoom)
      window.removeEventListener('keydown', handleKey)
    }
  }, [setPrimaryColor, setZoom, undo, redo])

  const handleResize = useCallback(() => {
    const w = Math.max(1, Math.min(256, Number(sizeWRef.current)))
    const h = Math.max(1, Math.min(256, Number(sizeHRef.current)))
    sizeWRef.current = w
    sizeHRef.current = h
    resizeCanvas(w, h)
  }, [resizeCanvas])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
      onDragOver={e => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f && f.type.startsWith('image/')) handleOpenLegacy(f)
      }}
    >
      {dragOver && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(79, 195, 247, 0.15)',
            border: '3px dashed #4fc3f7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: '#4fc3f7',
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          Drop image to open
        </div>
      )}

      <Toast message={toast.message} visible={toast.visible} />

      <div
        style={{
          height: 40,
          background: '#2d2d2d',
          borderBottom: '1px solid #444',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: '#4fc3f7' }}>Pixel Art Editor</span>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/gif,image/jpeg"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleOpenLegacy(f)
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />

        <button onClick={handleOpen} style={btnStyle}>
          <FolderOpen size={16} style={{ marginRight: 4 }} />
          Open
        </button>
        <button title="Save (Ctrl+S)" onClick={handleSave} style={btnAccent}>
          <Save size={16} style={{ marginRight: 4 }} />
          Save
        </button>

        <div style={{ width: 1, height: 24, background: '#444', margin: '0 8px' }} />

        <label style={{ fontSize: 12, color: '#aaa' }}>W:</label>
        <input
          type="number"
          defaultValue={state.pixelData.width}
          min={1}
          max={256}
          onChange={e => {
            sizeWRef.current = Number(e.target.value)
          }}
          style={{
            width: 48,
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid #555',
            background: '#1e1e1e',
            color: '#e0e0e0',
            fontSize: 12,
          }}
        />
        <label style={{ fontSize: 12, color: '#aaa' }}>H:</label>
        <input
          type="number"
          defaultValue={state.pixelData.height}
          min={1}
          max={256}
          onChange={e => {
            sizeHRef.current = Number(e.target.value)
          }}
          style={{
            width: 48,
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid #555',
            background: '#1e1e1e',
            color: '#e0e0e0',
            fontSize: 12,
          }}
        />
        <button
          onClick={handleResize}
          style={{
            padding: '2px 10px',
            borderRadius: 4,
            border: '1px solid #4fc3f7',
            background: 'transparent',
            color: '#4fc3f7',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Resize
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setAiOpen(!aiOpen)}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: aiOpen ? '1px solid #4fc3f7' : '1px solid #555',
            background: aiOpen ? '#1a3a4a' : 'transparent',
            color: aiOpen ? '#4fc3f7' : '#aaa',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <BotMessageSquare size={16} style={{ marginRight: 4 }} /> AI
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Toolbar
          activeTool={state.activeTool}
          onToolChange={setTool}
          zoom={state.zoom}
          onZoomChange={setZoom}
          brushSize={state.brushSize}
          onBrushSizeChange={setBrushSize}
          onClear={clearCanvas}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <Canvas
          pixelData={state.pixelData}
          tool={state.activeTool}
          primaryColor={state.primaryColor}
          zoom={state.zoom}
          brushSize={state.brushSize}
          onPaintBrush={paintBrush}
          onFillRegion={fillRegion}
          onShadePixel={shadePixel}
          onPickColor={pickColor}
          onSelectionChange={() => {}}
        />

        <ColorPalette
          primaryColor={state.primaryColor}
          secondaryColor={state.secondaryColor}
          onPrimaryChange={setPrimaryColor}
          onSecondaryChange={setSecondaryColor}
        />

        <AIChat
          isOpen={aiOpen}
          onToggle={() => setAiOpen(!aiOpen)}
          extractCanvasAsBase64={extractFullCanvasAsBase64}
          applyPixels={applyFullPixels}
        />
      </div>

      <div
        style={{
          height: 24,
          background: '#2d2d2d',
          borderTop: '1px solid #444',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: 11,
          color: '#888',
          gap: 16,
        }}
      >
        <span>{fileNameRef.current}.png</span>
        <span>Tool: {state.activeTool}</span>
        <span>
          Size: {state.pixelData.width}x{state.pixelData.height}
        </span>
        <span>Zoom: {state.zoom}x</span>
      </div>
    </div>
  )
}
