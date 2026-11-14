import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { BotMessageSquare, Save } from 'lucide-react'
import Canvas from './components/Canvas'
import type { CanvasHandle, Point } from './components/Canvas'
import CanvasSizeControl from './components/CanvasSizeControl'
import ColorPalette from './components/ColorPalette'
import AIChat from './components/AIChat'
import AnimationPreview from './components/AnimationPreview'
import ConvertDialog from './components/ConvertDialog'
import ExportDialog from './components/ExportDialog'
import SpriteSheetDialog from './components/SpriteSheetDialog'
import FileMenu from './components/FileMenu'
import Toast, { useToast } from './components/Toast'
import Timeline from './components/Timeline'
import Toolbar from './components/Toolbar'
import TooltipLayer, { tip } from './components/Tooltip'
import { useEditor } from './hooks/useEditor'
import { useFileActions } from './hooks/useFileActions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePalette } from './hooks/usePalette'
import type { Selection } from './types'
import { TRANSPARENT, parseColor, toHex } from './utils/color'
import { paletteSnapper } from './utils/palette'

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

/** Position and color of the pixel under the pointer, at the right of the status bar. */
function PixelInfo({ pixel, color }: { pixel: Point | null; color: string | undefined }) {
  if (!pixel || color === undefined) return null
  const rgba = parseColor(color)
  const transparent = color === TRANSPARENT || !rgba
  const label = transparent
    ? 'transparent'
    : rgba[3] === 255
      ? toHex(rgba)
      : `${toHex(rgba)} ${Math.round((rgba[3] / 255) * 100)}%`
  return (
    <span
      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}
    >
      {pixel.x}, {pixel.y}
      <span
        style={{
          width: 10,
          height: 10,
          border: '1px solid #666',
          background: transparent ? 'repeating-conic-gradient(#f0f0f0 0% 25%, #cfcfcf 0% 50%) 50% / 6px 6px' : color,
        }}
      />
      {label}
    </span>
  )
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
    toggleShapeFilled,
    toggleMirrorX,
    toggleMirrorY,
    paintLine,
    beginShape,
    drawShape,
    fillRegion,
    shadePixel,
    commitHistory,
    pickColor,
    resizeCanvas,
    clearCanvas,
    applyPixels,
    remapColors,
    hasClipboard,
    getSelection,
    setSelection,
    selectAll,
    copySelection,
    cutSelection,
    deleteSelection,
    pasteClipboard,
    beginMove,
    moveSelectionTo,
    nudgeSelection,
    importFrames,
    selectFrame,
    addFrame,
    duplicateFrame,
    deleteFrame,
    moveFrame,
    toggleOnionSkin,
    setFps,
    undo,
    redo,
  } = useEditor()
  const { palette, locked, toggleLocked, addColor, removeColor, moveColor, replacePalette, resetPalette } = usePalette()
  const { toast, showToast } = useToast()
  const files = useFileActions({
    pixelData: state.pixelData,
    frames: state.frames,
    fps: state.fps,
    importFrames,
    palette,
    replacePalette,
    showToast,
  })

  const [aiOpen, setAiOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [hoverPixel, setHoverPixel] = useState<Point | null>(null)
  const [playing, setPlaying] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const openExport = useCallback(() => setExportOpen(true), [])
  const togglePlay = useCallback(() => setPlaying(p => !p), [])
  const canvasHandleRef = useRef<CanvasHandle>(null)
  const pixelDataRef = useRef(state.pixelData)
  pixelDataRef.current = state.pixelData

  // Maps colors to the palette while it is locked
  const snap = useMemo(() => (locked ? paletteSnapper(palette.colors) : null), [locked, palette.colors])

  // Whatever sets the drawing colors (swatches, color picker, eyedropper), locked colors stay in the palette
  useEffect(() => {
    if (!snap) return
    if (snap(state.primaryColor) !== state.primaryColor) setPrimaryColor(snap(state.primaryColor))
    if (snap(state.secondaryColor) !== state.secondaryColor) setSecondaryColor(snap(state.secondaryColor))
  }, [snap, state.primaryColor, state.secondaryColor, setPrimaryColor, setSecondaryColor])

  const handleShadePixel = useCallback(
    (x: number, y: number) => shadePixel(x, y, snap ?? undefined),
    [shadePixel, snap],
  )

  const handleReduceToPalette = useCallback(() => {
    const changed = remapColors(paletteSnapper(palette.colors))
    showToast(changed > 0 ? `Mapped ${changed} pixels to the palette` : 'Already uses only palette colors')
  }, [remapColors, palette.colors, showToast])

  /** The region the AI edits: the current selection, or the whole canvas. */
  const getAiRegion = useCallback((): Selection => {
    const pd = pixelDataRef.current
    return getSelection() ?? { x: 0, y: 0, width: pd.width, height: pd.height }
  }, [getSelection])

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
      const source = snap ? pixels.map(row => row.map(snap)) : pixels
      const applied = applyPixels(source, region.x, region.y, region.width, region.height)
      if (applied === 0) throw new Error('The AI response did not contain any valid pixel colors')
    },
    [applyPixels, getAiRegion, snap],
  )

  const handleCopy = useCallback(() => {
    showToast(copySelection() ? 'Copied selection' : 'Select an area first')
  }, [copySelection, showToast])

  const handleCut = useCallback(() => {
    showToast(cutSelection() ? 'Cut selection' : 'Select an area first')
  }, [cutSelection, showToast])

  /** Pastes at the top-left of the selection, or of the canvas; the pasted area is left selected, ready to drag. */
  const handlePaste = useCallback(() => {
    const at = getSelection()
    if (pasteClipboard(at?.x ?? 0, at?.y ?? 0)) setTool('selection')
    else showToast('Clipboard is empty')
  }, [getSelection, pasteClipboard, setTool, showToast])

  const handleSelectAll = useCallback(() => {
    selectAll()
    setTool('selection')
  }, [selectAll, setTool])

  const handleFit = useCallback(() => {
    const zoom = canvasHandleRef.current?.getFitZoom()
    if (zoom == null) return
    canvasHandleRef.current?.resetPan()
    setZoom(zoom)
  }, [setZoom])

  const zoomRef = useRef(state.zoom)
  zoomRef.current = state.zoom

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

  const frameRef = useRef({ current: state.currentFrame, count: state.frames.length })
  frameRef.current = { current: state.currentFrame, count: state.frames.length }

  /** Previous or next frame, wrapping around like the animation does. */
  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const { current, count } = frameRef.current
      selectFrame((current + direction + count) % count)
    },
    [selectFrame],
  )

  useKeyboardShortcuts({
    undo,
    redo,
    save: files.saveImage,
    open: files.openWithDialog,
    exportImage: openExport,
    fit: handleFit,
    toggleGrid,
    copy: handleCopy,
    cut: handleCut,
    paste: handlePaste,
    selectAll: handleSelectAll,
    remove: deleteSelection,
    deselect: () => setSelection(null),
    nudge: nudgeSelection,
    setTool,
    swapColors,
    stepFrame,
    togglePlay,
  })

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
        // Only files: dragging a palette swatch to reorder it must not show the drop overlay
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f && f.type.startsWith('image/')) files.openFile(f)
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

      <Toast message={toast} />
      <TooltipLayer />

      {files.pendingImage && (
        <ConvertDialog
          image={files.pendingImage.image}
          fileName={files.pendingImage.name}
          onConvert={files.acceptConversion}
          onOpenOriginal={files.openOriginal}
          onCancel={files.cancelConversion}
        />
      )}

      {files.pendingSheet && (
        <SpriteSheetDialog
          image={files.pendingSheet.image}
          fileName={files.pendingSheet.name}
          onImport={files.acceptSpriteSheet}
          onCancel={files.cancelSpriteSheet}
        />
      )}

      {exportOpen && (
        <ExportDialog
          frames={state.frames}
          currentFrame={state.currentFrame}
          onExport={options => {
            setExportOpen(false)
            files.exportImage(options)
          }}
          onCancel={() => setExportOpen(false)}
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

        <FileMenu
          onNew={files.newCanvas}
          onOpen={files.openWithDialog}
          onImportAsPixelArt={file => files.openFile(file, true)}
          onImportSpriteSheet={files.openSpriteSheet}
          onSave={files.saveImage}
          onExport={openExport}
        />
        <button {...tip('Save', 'Ctrl+S')} onClick={files.saveImage} style={btnAccent}>
          <Save size={16} />
        </button>

        <div style={{ width: 1, height: 24, background: '#444', margin: '0 8px' }} />

        <CanvasSizeControl width={state.pixelData.width} height={state.pixelData.height} onResize={resizeCanvas} />

        <div style={{ flex: 1 }} />

        <button
          {...tip('AI assistant: edit the canvas or the selection from a description')}
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
          shapeFilled={state.shapeFilled}
          onToggleShapeFilled={toggleShapeFilled}
          mirrorX={state.mirrorX}
          mirrorY={state.mirrorY}
          onToggleMirrorX={toggleMirrorX}
          onToggleMirrorY={toggleMirrorY}
          hasSelection={state.selection !== null}
          hasClipboard={hasClipboard}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onDelete={deleteSelection}
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
          mirrorX={state.mirrorX}
          mirrorY={state.mirrorY}
          pixelData={state.pixelData}
          onionFrame={state.onionSkin && state.currentFrame > 0 ? state.frames[state.currentFrame - 1] : null}
          tool={state.activeTool}
          primaryColor={state.primaryColor}
          secondaryColor={state.secondaryColor}
          zoom={state.zoom}
          brushSize={state.brushSize}
          shapeFilled={state.shapeFilled}
          onPaintLine={paintLine}
          onShapeStart={beginShape}
          onDrawShape={drawShape}
          onFillRegion={fillRegion}
          onShadePixel={handleShadePixel}
          onStrokeEnd={commitHistory}
          onPickColor={pickColor}
          onColorPicked={handleColorPicked}
          selection={state.selection}
          onSelectionChange={setSelection}
          onMoveStart={beginMove}
          onMoveTo={moveSelectionTo}
          onZoomStep={handleZoomStep}
          onHoverPixel={setHoverPixel}
        />

        <ColorPalette
          primaryColor={state.primaryColor}
          secondaryColor={state.secondaryColor}
          onPrimaryChange={setPrimaryColor}
          onSecondaryChange={setSecondaryColor}
          onSwap={swapColors}
          paletteName={palette.name}
          paletteColors={palette.colors}
          onAddColor={() => addColor(state.primaryColor)}
          onRemoveColor={removeColor}
          onMoveColor={moveColor}
          onResetPalette={resetPalette}
          onImportFile={files.importPalette}
          onExport={files.exportPalette}
          locked={locked}
          onToggleLock={toggleLocked}
          onReduce={handleReduceToPalette}
        />

        <AIChat
          isOpen={aiOpen}
          onToggle={() => setAiOpen(!aiOpen)}
          extractCanvas={extractCanvasForAI}
          applyPixels={applyAiPixels}
        />
      </div>

      <Timeline
        frames={state.frames}
        currentFrame={state.currentFrame}
        onSelectFrame={selectFrame}
        onAddFrame={addFrame}
        onDuplicateFrame={duplicateFrame}
        onDeleteFrame={deleteFrame}
        onMoveFrame={moveFrame}
        onionSkin={state.onionSkin}
        onToggleOnionSkin={toggleOnionSkin}
      >
        <AnimationPreview
          frames={state.frames}
          currentFrame={state.currentFrame}
          fps={state.fps}
          onFpsChange={setFps}
          playing={playing && state.frames.length > 1}
          onTogglePlay={togglePlay}
        />
      </Timeline>

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
        <span>{files.fileName}.png</span>
        <span>Tool: {state.activeTool}</span>
        <span>
          Size: {state.pixelData.width}x{state.pixelData.height}
        </span>
        <span>Zoom: {state.zoom}x</span>
        {state.selection && (
          <span>
            Selection: {state.selection.width}x{state.selection.height} at {state.selection.x}, {state.selection.y}
          </span>
        )}
        <PixelInfo
          pixel={hoverPixel}
          color={hoverPixel ? state.pixelData.pixels[hoverPixel.y]?.[hoverPixel.x] : undefined}
        />
      </div>
    </div>
  )
}
