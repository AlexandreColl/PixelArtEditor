import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import ColorPalette from './components/ColorPalette'
import AIChat from './components/AIChat'
import type { CanvasHandle } from './components/Canvas'
import ConvertDialog, { MAX_ORIGINAL_SIZE } from './components/ConvertDialog'
import { useEditor } from './hooks/useEditor'
import type { PixelData, Selection } from './types'
import { formatColor } from './utils/color'
import { countColors } from './utils/pixelate'
import { EXPORT_SCALES, pixelsToPngDataUrl } from './utils/png'
import { Save, FolderOpen, BotMessageSquare, FilePlus, ImagePlus, ImageDown } from 'lucide-react'

async function savePngFile(pixels: string[][], width: number, height: number, filePath: string, scale = 1) {
  const dataUrl = pixelsToPngDataUrl(pixels, width, height, scale)
  await invoke('save_png_file', { path: filePath, base64Data: dataUrl.split(',')[1] })
}

function loadImageFile(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, img.width, img.height))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

function imageDataToPixels(imageData: ImageData): PixelData {
  const { width, height, data } = imageData
  const pixels: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      row.push(formatColor([data[i], data[i + 1], data[i + 2], data[i + 3]]))
    }
    pixels.push(row)
  }
  return { width, height, pixels }
}

/** Photos and large images get the conversion dialog; small sprites with few colors open as they are. */
function needsConversion(imageData: ImageData): boolean {
  return Math.max(imageData.width, imageData.height) > 128 || countColors(imageData, 256) > 256
}

interface PendingImage {
  image: ImageData
  name: string
  /** Original file path, only kept when the file is a PNG that can be overwritten on save */
  path: string | null
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
    swapColors,
    setZoom,
    setBrushSize,
    toggleGrid,
    paintLine,
    fillRegion,
    shadePixel,
    commitHistory,
    pickColor,
    resizeCanvas,
    clearCanvas,
    applyPixels,
    importPixels,
    undo,
    redo,
  } = useEditor()

  const [aiOpen, setAiOpen] = useState(false)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [exportScale, setExportScale] = useState(4)
  const forceConvertRef = useRef(false)
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false })
  const filePathRef = useRef<string | null>(null)
  const fileNameRef = useRef('untitled')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sizeW, setSizeW] = useState(String(state.pixelData.width))
  const [sizeH, setSizeH] = useState(String(state.pixelData.height))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pixelDataRef = useRef(state.pixelData)
  const selectionRef = useRef<Selection | null>(null)

  pixelDataRef.current = state.pixelData

  // Keep the W/H inputs in sync when the canvas changes size (open, new, undo of a resize...)
  useEffect(() => {
    setSizeW(String(state.pixelData.width))
    setSizeH(String(state.pixelData.height))
  }, [state.pixelData.width, state.pixelData.height])

  const handleSelectionChange = useCallback((sel: Selection | null) => {
    selectionRef.current = sel
  }, [])

  /** The region the AI edits: the current selection, or the whole canvas. */
  const getAiRegion = useCallback((): Selection => {
    const pd = pixelDataRef.current
    return selectionRef.current ?? { x: 0, y: 0, width: pd.width, height: pd.height }
  }, [])

  const extractCanvasForAI = useCallback(() => {
    const pd = pixelDataRef.current
    const region = getAiRegion()
    const c = document.createElement('canvas')
    c.width = region.width
    c.height = region.height
    const ctx = c.getContext('2d')!
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        ctx.fillStyle = pd.pixels[region.y + y][region.x + x]
        ctx.fillRect(x, y, 1, 1)
      }
    }
    return { base64: c.toDataURL('image/png').split(',')[1] || '', width: region.width, height: region.height }
  }, [getAiRegion])

  const applyAiPixels = useCallback(
    (pixels: string[][]) => {
      const region = getAiRegion()
      const applied = applyPixels(pixels, region.x, region.y, region.width, region.height)
      if (applied === 0) throw new Error('The AI response did not contain any valid pixel colors')
    },
    [applyPixels, getAiRegion],
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

  /** Saves a scaled copy as a new file; unlike Save it leaves the current file path and name alone. */
  const handleExport = useCallback(async () => {
    try {
      const { pixels, width, height } = state.pixelData
      const fp = await save({
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        defaultPath: `${fileNameRef.current}@${exportScale}x.png`,
      })
      if (!fp) return
      await savePngFile(pixels, width, height, /\.png$/i.test(fp) ? fp : `${fp}.png`, exportScale)
      showToast(`Exported ${width * exportScale}x${height * exportScale} PNG`)
    } catch (err) {
      showToast('Export failed')
      console.error(err)
    }
  }, [state.pixelData, exportScale, showToast])

  const handleSave = useCallback(async () => {
    if (filePathRef.current) {
      await doSavePng(filePathRef.current)
    } else {
      const fp = await save({
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        defaultPath: `${fileNameRef.current}.png`,
      })
      if (fp) await doSavePng(/\.png$/i.test(fp) ? fp : `${fp}.png`)
    }
  }, [doSavePng])

  const handleNew = useCallback(() => {
    const empty: string[][] = []
    for (let y = 0; y < 32; y++) {
      const row: string[] = []
      for (let x = 0; x < 32; x++) row.push('rgba(0,0,0,0)')
      empty.push(row)
    }
    importPixels(empty, 32, 32)
    filePathRef.current = null
    fileNameRef.current = 'untitled'
    showToast('New canvas created')
  }, [importPixels, showToast])

  const openImage = useCallback(
    (image: ImageData, name: string, path: string | null, forceConvert = false) => {
      if (forceConvert || needsConversion(image)) {
        setPendingImage({ image, name, path })
        return
      }
      const pd = imageDataToPixels(image)
      importPixels(pd.pixels, pd.width, pd.height)
      filePathRef.current = path
      fileNameRef.current = name
    },
    [importPixels],
  )

  const handleConvert = useCallback(
    (pd: PixelData) => {
      if (!pendingImage) return
      importPixels(pd.pixels, pd.width, pd.height)
      // The result is a new image: never overwrite the source photo on save
      filePathRef.current = null
      fileNameRef.current = `${pendingImage.name}-pixel`
      setPendingImage(null)
      showToast(`Converted to ${pd.width}x${pd.height} pixel art`)
    },
    [pendingImage, importPixels, showToast],
  )

  const handleOpenOriginal = useCallback(() => {
    if (!pendingImage || Math.max(pendingImage.image.width, pendingImage.image.height) > MAX_ORIGINAL_SIZE) return
    const pd = imageDataToPixels(pendingImage.image)
    importPixels(pd.pixels, pd.width, pd.height)
    filePathRef.current = pendingImage.path
    fileNameRef.current = pendingImage.name
    setPendingImage(null)
  }, [pendingImage, importPixels])

  const handleImportAsPixelArt = useCallback(() => {
    forceConvertRef.current = true
    fileInputRef.current?.click()
  }, [])

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
      const image = await loadImageFile(file)
      const name =
        fp
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^/.]+$/, '') || 'untitled'
      // Saving always writes PNG, so only overwrite the original when it is a PNG
      openImage(image, name, /\.png$/i.test(fp) ? fp : null)
    } catch {
      showToast('Could not open image')
    }
  }, [openImage, showToast])

  const handleOpenLegacy = useCallback(
    async (file: File, forceConvert = false) => {
      try {
        const image = await loadImageFile(file)
        openImage(image, file.name.replace(/\.[^/.]+$/, '') || 'untitled', null, forceConvert)
      } catch {
        showToast('Could not open image')
      }
    },
    [openImage, showToast],
  )

  const canvasHandleRef = useRef<CanvasHandle>(null)

  const handleFit = useCallback(() => {
    const zoom = canvasHandleRef.current?.getFitZoom()
    if (zoom == null) return
    canvasHandleRef.current?.resetPan()
    setZoom(zoom)
  }, [setZoom])
  const handleFitRef = useRef(handleFit)
  handleFitRef.current = handleFit

  const zoomRef = useRef(state.zoom)
  zoomRef.current = state.zoom
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  const handleOpenRef = useRef(handleOpen)
  handleOpenRef.current = handleOpen

  const handleZoomStep = useCallback(
    (direction: 1 | -1) => {
      const z = zoomRef.current
      // Small steps at low zoom so every level stays reachable
      const step = z < 8 ? 1 : 4
      setZoom(z + direction * step)
    },
    [setZoom],
  )

  const handleColorPicked = useCallback(
    (color: string, secondary: boolean) => {
      if (secondary) setSecondaryColor(color)
      else setPrimaryColor(color)
    },
    [setPrimaryColor, setSecondaryColor],
  )

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Leave text editing shortcuts alone in inputs and textareas
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      // With Shift or Caps Lock e.key is upper case
      const key = e.key.toLowerCase()
      if (!(e.ctrlKey || e.metaKey)) {
        if (key === 'g' && !e.altKey && !e.shiftKey) toggleGrid()
        return
      }
      if (key === '0') {
        e.preventDefault()
        handleFitRef.current()
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 's') {
        e.preventDefault()
        handleSaveRef.current()
      } else if (key === 'o') {
        e.preventDefault()
        handleOpenRef.current()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo, toggleGrid])

  const handleResize = useCallback(() => {
    const clamp = (v: string, fallback: number) => {
      const n = Math.round(Number(v))
      return Number.isFinite(n) && n > 0 ? Math.min(256, n) : fallback
    }
    const w = clamp(sizeW, state.pixelData.width)
    const h = clamp(sizeH, state.pixelData.height)
    setSizeW(String(w))
    setSizeH(String(h))
    resizeCanvas(w, h)
  }, [sizeW, sizeH, state.pixelData.width, state.pixelData.height, resizeCanvas])

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

      {pendingImage && (
        <ConvertDialog
          image={pendingImage.image}
          fileName={pendingImage.name}
          onConvert={handleConvert}
          onOpenOriginal={handleOpenOriginal}
          onCancel={() => setPendingImage(null)}
        />
      )}

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
            if (f) handleOpenLegacy(f, forceConvertRef.current)
            forceConvertRef.current = false
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />

        <button title="New (32x32)" onClick={handleNew} style={btnStyle}>
          <FilePlus size={16} />
        </button>
        <button title="Open (Ctrl+O)" onClick={handleOpen} style={btnStyle}>
          <FolderOpen size={16} />
        </button>
        <button title="Import image as pixel art" onClick={handleImportAsPixelArt} style={btnStyle}>
          <ImagePlus size={16} />
        </button>
        <button title="Save (Ctrl+S)" onClick={handleSave} style={btnAccent}>
          <Save size={16} />
        </button>
        <button title="Export scaled PNG" onClick={handleExport} style={{ ...btnStyle, padding: '4px 6px 4px 10px' }}>
          <ImageDown size={16} />
        </button>
        <select
          title="Export scale"
          value={exportScale}
          onChange={e => setExportScale(Number(e.target.value))}
          style={{
            padding: '3px 4px',
            borderRadius: 4,
            border: '1px solid #555',
            background: '#1e1e1e',
            color: '#e0e0e0',
            fontSize: 12,
          }}
        >
          {EXPORT_SCALES.map(n => (
            <option key={n} value={n}>
              ×{n}
            </option>
          ))}
        </select>

        <div style={{ width: 1, height: 24, background: '#444', margin: '0 8px' }} />

        <label style={{ fontSize: 12, color: '#aaa' }}>W:</label>
        <input
          type="number"
          value={sizeW}
          min={1}
          max={256}
          onChange={e => setSizeW(e.target.value)}
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
          value={sizeH}
          min={1}
          max={256}
          onChange={e => setSizeH(e.target.value)}
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
          onFit={handleFit}
          showGrid={state.showGrid}
          onToggleGrid={toggleGrid}
          brushSize={state.brushSize}
          onBrushSizeChange={setBrushSize}
          onClear={clearCanvas}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <Canvas
          handleRef={canvasHandleRef}
          showGrid={state.showGrid}
          pixelData={state.pixelData}
          tool={state.activeTool}
          primaryColor={state.primaryColor}
          secondaryColor={state.secondaryColor}
          zoom={state.zoom}
          brushSize={state.brushSize}
          onPaintLine={paintLine}
          onFillRegion={fillRegion}
          onShadePixel={shadePixel}
          onStrokeEnd={commitHistory}
          onPickColor={pickColor}
          onColorPicked={handleColorPicked}
          onSelectionChange={handleSelectionChange}
          onZoomStep={handleZoomStep}
        />

        <ColorPalette
          primaryColor={state.primaryColor}
          secondaryColor={state.secondaryColor}
          onPrimaryChange={setPrimaryColor}
          onSecondaryChange={setSecondaryColor}
          onSwap={swapColors}
        />

        <AIChat
          isOpen={aiOpen}
          onToggle={() => setAiOpen(!aiOpen)}
          extractCanvas={extractCanvasForAI}
          applyPixels={applyAiPixels}
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
