import { useCallback, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { MAX_ORIGINAL_SIZE } from '../components/ConvertDialog'
import type { EditorDocument } from './useEditor'
import type { ExportOptions } from '../components/ExportDialog'
import type { Layer, Palette, PixelData } from '../types'
import { TRANSPARENT } from '../utils/color'
import { fileBaseName, imageDataToPixels, loadImageFile, needsConversion, withExtension } from '../utils/image'
import { PALETTE_EXTENSIONS, formatForPath, parsePalette, serializePalette } from '../utils/palette'
import { encodeGif } from '../utils/gif'
import { PROJECT_EXTENSION, parseProject, serializeProject } from '../utils/project'
import { flattenFrameCached } from '../utils/layers'
import { pixelsToPngDataUrl } from '../utils/png'
import { type FrameDuration, hasCustomDurations } from '../utils/timing'
import { addPngText, base64ToBytes, bytesToBase64, readPngText } from '../utils/pngText'
import {
  ANIMATION_KEY,
  type AnimationInfo,
  framesToSheet,
  parseAnimationInfo,
  serializeAnimationInfo,
  sheetToFrames,
} from '../utils/spriteSheet'

const NEW_CANVAS_SIZE = 32

/** An image waiting in the conversion dialog. */
export interface PendingImage {
  image: ImageData
  name: string
  /** Original file path, only kept when the file is a PNG that can be overwritten on save */
  path: string | null
}

interface FileActionsOptions {
  /** cels[frame][layer] */
  cels: PixelData[][]
  layers: Layer[]
  /** The frame that Export writes as a single image */
  currentFrame: number
  fps: number
  durations: FrameDuration[]
  importFrames: (frames: string[][][], width: number, height: number, fps?: number, durations?: FrameDuration[]) => void
  importDocument: (doc: EditorDocument) => void
  /** Called after a save that kept everything, so the editor knows there are no unsaved changes */
  markSaved: () => void
  palette: Palette
  replacePalette: (name: string, colors: unknown[]) => boolean
  showToast: (message: string) => void
}

async function savePngFile(pixelData: PixelData, filePath: string, scale = 1, animation?: AnimationInfo) {
  let base64 = pixelsToPngDataUrl(pixelData.pixels, pixelData.width, pixelData.height, scale).split(',')[1]
  if (animation) {
    base64 = bytesToBase64(addPngText(base64ToBytes(base64), ANIMATION_KEY, serializeAnimationInfo(animation)))
  }
  await invoke('save_png_file', { path: filePath, base64Data: base64 })
}

export type FileKind = 'png' | typeof PROJECT_EXTENSION

const isProjectPath = (path: string) => path.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)

const SAVE_FILTERS = {
  png: { name: 'PNG Image (layers merged)', extensions: ['png'] },
  [PROJECT_EXTENSION]: { name: 'Pixel Art Editor project', extensions: [PROJECT_EXTENSION] },
}

/** The frames recorded in a PNG saved by the editor, or null for any other image. */
function savedAnimation(image: ImageData, bytes: Uint8Array | undefined) {
  const info = bytes && parseAnimationInfo(readPngText(bytes, ANIMATION_KEY), image.width, image.height)
  if (!info) return null
  const sheet = imageDataToPixels(image)
  return {
    info,
    frames: sheetToFrames(sheet.pixels, sheet.width, sheet.height, info.frameWidth, info.frameHeight, info.frames),
  }
}

/**
 * Opening, saving and exporting images and palettes, and the image waiting for conversion.
 * Desktop dialogs go through Tauri; dropped and picked File objects work in any webview.
 */
export function useFileActions({
  cels,
  layers,
  currentFrame,
  fps,
  durations,
  importFrames,
  importDocument,
  markSaved,
  palette,
  replacePalette,
  showToast,
}: FileActionsOptions) {
  // Where Save writes without asking; null until the image is saved or opened from a PNG
  const filePathRef = useRef<string | null>(null)
  const [fileName, setFileName] = useState('untitled')
  const [fileKind, setFileKind] = useState<FileKind>('png')
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  // An image waiting for its frame size in the sprite sheet dialog
  const [pendingSheet, setPendingSheet] = useState<{ image: ImageData; name: string } | null>(null)

  /** Every frame as shown, with its visible layers blended. Cached, so cheap to call on each save. */
  const flatFrames = useCallback(() => cels.map(row => flattenFrameCached(row, layers)), [cels, layers])

  const setFile = useCallback((path: string | null, name: string, kind: FileKind = 'png') => {
    filePathRef.current = path
    setFileName(name)
    setFileKind(kind)
  }, [])

  /** Opens a project file's text; returns false if it is not a valid project (the toast says why). */
  const openProject = useCallback(
    (text: string, path: string | null, name: string) => {
      try {
        importDocument(parseProject(text))
        setFile(path, name, PROJECT_EXTENSION)
        return true
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not open the project')
        return false
      }
    },
    [importDocument, setFile, showToast],
  )

  const newCanvas = useCallback(() => {
    const row = Array<string>(NEW_CANVAS_SIZE).fill(TRANSPARENT)
    importFrames([Array.from({ length: NEW_CANVAS_SIZE }, () => [...row])], NEW_CANVAS_SIZE, NEW_CANVAS_SIZE)
    setFile(null, 'untitled')
    showToast('New canvas created')
  }, [importFrames, setFile, showToast])

  /** Opens an image; `bytes` is the file, to find the frames of an animation saved by the editor. */
  const openImage = useCallback(
    (image: ImageData, name: string, path: string | null, forceConvert = false, bytes?: Uint8Array) => {
      // Checked first: a long strip of frames would otherwise look like an image too big to open as is
      const animation = forceConvert ? null : savedAnimation(image, bytes)
      if (animation) {
        const { info } = animation
        importFrames(animation.frames, info.frameWidth, info.frameHeight, info.fps, info.durations)
        setFile(path, name)
        return
      }
      if (forceConvert || needsConversion(image)) {
        setPendingImage({ image, name, path })
        return
      }
      const pd = imageDataToPixels(image)
      importFrames([pd.pixels], pd.width, pd.height)
      setFile(path, name)
    },
    [importFrames, setFile],
  )

  /** Opens a dropped or picked file; it has no path, so the first save asks where to write. */
  const openFile = useCallback(
    async (file: File, forceConvert = false) => {
      if (isProjectPath(file.name)) {
        openProject(await file.text(), null, fileBaseName(file.name))
        return
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        openImage(await loadImageFile(file), fileBaseName(file.name), null, forceConvert, bytes)
      } catch {
        showToast('Could not open image')
      }
    },
    [openImage, openProject, showToast],
  )

  const openWithDialog = useCallback(async () => {
    try {
      const fp = await open({
        filters: [
          { name: 'Images and projects', extensions: ['png', 'gif', 'jpeg', 'jpg', PROJECT_EXTENSION] },
          { name: 'Pixel Art Editor project', extensions: [PROJECT_EXTENSION] },
        ],
        multiple: false,
        fileAccessMode: 'scoped',
      })
      if (!fp) return
      const data = await readFile(fp)
      if (isProjectPath(fp)) {
        openProject(new TextDecoder().decode(data), fp, fileBaseName(fp))
        return
      }
      const image = await loadImageFile(new File([new Blob([data])], fp.split(/[\\/]/).pop() || 'image.png'))
      // Saving always writes PNG, so only overwrite the original when it is a PNG
      openImage(image, fileBaseName(fp), /\.png$/i.test(fp) ? fp : null, false, data)
    } catch {
      showToast('Could not open image')
    }
  }, [openImage, openProject, showToast])

  const saveTo = useCallback(
    async (filePath: string) => {
      try {
        const name = fileBaseName(filePath)
        if (isProjectPath(filePath)) {
          const doc: EditorDocument = {
            width: cels[0][0].width,
            height: cels[0][0].height,
            fps,
            durations,
            layers,
            cels: cels.map(row => row.map(cel => cel.pixels)),
          }
          await invoke('save_project_file', { path: filePath, contents: serializeProject(doc) })
          setFile(filePath, name, PROJECT_EXTENSION)
          markSaved()
          showToast(`Saved ${name}.${PROJECT_EXTENSION}`)
          return
        }
        const frames = flatFrames()
        const { width, height } = frames[0]
        if (frames.length > 1) {
          // A strip of all the frames, which also opens as a sprite sheet in any other program
          const sheet = framesToSheet(
            frames.map(f => f.pixels),
            width,
            height,
          )
          await savePngFile(sheet, filePath, 1, {
            frames: frames.length,
            frameWidth: width,
            frameHeight: height,
            columns: frames.length,
            fps,
            ...(hasCustomDurations(durations) ? { durations } : {}),
          })
        } else {
          await savePngFile(frames[0], filePath)
        }
        setFile(filePath, name)
        // A PNG of several layers lost them, so the work still counts as unsaved (and stays autosaved)
        if (layers.length === 1) markSaved()
        const what = frames.length > 1 ? `${frames.length} frames` : 'image'
        showToast(`Saved ${what} as ${name}.png${layers.length > 1 ? ' (layers merged)' : ''}`)
      } catch (err) {
        showToast('Save failed')
        console.error(err)
      }
    },
    [cels, layers, flatFrames, fps, durations, setFile, markSaved, showToast],
  )

  /** Asks where to save, offering `kind` first; the extension picked in the dialog decides the format. */
  const saveAs = useCallback(
    async (kind: FileKind = layers.length > 1 ? PROJECT_EXTENSION : 'png') => {
      const other: FileKind = kind === 'png' ? PROJECT_EXTENSION : 'png'
      const fp = await save({ filters: [SAVE_FILTERS[kind], SAVE_FILTERS[other]], defaultPath: `${fileName}.${kind}` })
      if (!fp) return
      const chosen = isProjectPath(fp) || fp.toLowerCase().endsWith('.png') ? fp : withExtension(fp, kind)
      await saveTo(chosen)
    },
    [layers.length, fileName, saveTo],
  )

  /**
   * Saves to the open file without asking. A PNG can't keep layers, so with several layers
   * the first save of a PNG asks for a project file instead of merging them silently.
   */
  const saveImage = useCallback(async () => {
    const path = filePathRef.current
    if (path && (isProjectPath(path) || layers.length === 1)) {
      await saveTo(path)
      return
    }
    if (path) showToast('A PNG cannot keep layers: save as a project to keep them')
    await saveAs()
  }, [layers.length, saveTo, saveAs, showToast])

  /**
   * Writes the current frame or a sprite sheet, scaled, as a new file;
   * unlike Save it leaves the current file path and name alone.
   */
  const exportImage = useCallback(
    async ({ kind, scale, columns }: ExportOptions) => {
      try {
        const frames = flatFrames()
        const scaleSuffix = scale > 1 ? `@${scale}x` : ''
        if (kind === 'gif') {
          const fp = await save({
            filters: [{ name: 'GIF Animation', extensions: ['gif'] }],
            defaultPath: `${fileName}${scaleSuffix}.gif`,
          })
          if (!fp) return
          const { width, height } = frames[0]
          const gif = encodeGif(
            frames.map(f => f.pixels),
            width,
            height,
            { fps, durations, scale },
          )
          await invoke('save_gif_file', { path: withExtension(fp, 'gif'), base64Data: bytesToBase64(gif) })
          showToast(`Exported a ${frames.length}-frame GIF`)
          return
        }
        const suffix = (kind === 'sheet' ? '-sheet' : '') + scaleSuffix
        const fp = await save({
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
          defaultPath: `${fileName}${suffix}.png`,
        })
        if (!fp) return
        const path = withExtension(fp, 'png')
        if (kind === 'frame') {
          const frame = frames[Math.min(currentFrame, frames.length - 1)]
          await savePngFile(frame, path, scale)
          showToast(`Exported ${frame.width * scale}x${frame.height * scale} PNG`)
          return
        }
        const { width, height } = frames[0]
        const sheet = framesToSheet(
          frames.map(f => f.pixels),
          width,
          height,
          columns,
        )
        // The layout goes in the file too, so the editor opens it back as frames
        await savePngFile(sheet, path, scale, {
          frames: frames.length,
          frameWidth: width * scale,
          frameHeight: height * scale,
          columns: Math.min(columns, frames.length),
          fps,
        })
        showToast(`Exported a ${sheet.width * scale}x${sheet.height * scale} sprite sheet`)
      } catch (err) {
        showToast('Export failed')
        console.error(err)
      }
    },
    [flatFrames, currentFrame, fps, durations, fileName, showToast],
  )

  /** Opens an image to cut into frames; the sprite sheet dialog asks for the frame size. */
  const openSpriteSheet = useCallback(
    async (file: File) => {
      try {
        setPendingSheet({ image: await loadImageFile(file), name: fileBaseName(file.name) })
      } catch {
        showToast('Could not open image')
      }
    },
    [showToast],
  )

  const acceptSpriteSheet = useCallback(
    (frameWidth: number, frameHeight: number) => {
      if (!pendingSheet) return
      const sheet = imageDataToPixels(pendingSheet.image)
      const cut = sheetToFrames(sheet.pixels, sheet.width, sheet.height, frameWidth, frameHeight)
      importFrames(cut, frameWidth, frameHeight)
      // Saving writes a strip of frames, maybe not the original layout, so never overwrite the source
      setFile(null, pendingSheet.name)
      setPendingSheet(null)
      showToast(`Imported ${cut.length} frame${cut.length === 1 ? '' : 's'} of ${frameWidth}x${frameHeight}`)
    },
    [pendingSheet, importFrames, setFile, showToast],
  )

  const cancelSpriteSheet = useCallback(() => setPendingSheet(null), [])

  /** Names recovered work after its old file, without a path: it was never saved there, so Save asks where. */
  const adoptRecovered = useCallback((name: string, kind: FileKind) => setFile(null, name, kind), [setFile])

  const acceptConversion = useCallback(
    (pd: PixelData) => {
      if (!pendingImage) return
      importFrames([pd.pixels], pd.width, pd.height)
      // The result is a new image: never overwrite the source photo on save
      setFile(null, `${pendingImage.name}-pixel`)
      setPendingImage(null)
      showToast(`Converted to ${pd.width}x${pd.height} pixel art`)
    },
    [pendingImage, importFrames, setFile, showToast],
  )

  const openOriginal = useCallback(() => {
    if (!pendingImage || Math.max(pendingImage.image.width, pendingImage.image.height) > MAX_ORIGINAL_SIZE) return
    const pd = imageDataToPixels(pendingImage.image)
    importFrames([pd.pixels], pd.width, pd.height)
    setFile(pendingImage.path, pendingImage.name)
    setPendingImage(null)
  }, [pendingImage, importFrames, setFile])

  const cancelConversion = useCallback(() => setPendingImage(null), [])

  const importPalette = useCallback(
    async (file: File) => {
      try {
        const imported = parsePalette(await file.text(), file.name)
        replacePalette(imported.name, imported.colors)
        showToast(`Imported ${imported.colors.length} colors from ${file.name}`)
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not import the palette')
      }
    },
    [replacePalette, showToast],
  )

  const exportPalette = useCallback(async () => {
    try {
      const fp = await save({
        filters: [
          { name: 'GIMP / Aseprite palette', extensions: ['gpl'] },
          { name: 'Lospec hex palette', extensions: ['hex'] },
        ],
        defaultPath: `${palette.name}.gpl`,
      })
      if (!fp) return
      const path = PALETTE_EXTENSIONS.some(ext => fp.toLowerCase().endsWith('.' + ext)) ? fp : `${fp}.gpl`
      await invoke('save_palette_file', { path, contents: serializePalette(palette, formatForPath(path)) })
      showToast(`Exported ${palette.colors.length} colors`)
    } catch (err) {
      showToast('Palette export failed')
      console.error(err)
    }
  }, [palette, showToast])

  return {
    fileName,
    fileKind,
    pendingImage,
    pendingSheet,
    newCanvas,
    openFile,
    openWithDialog,
    saveImage,
    saveAs,
    exportImage,
    openSpriteSheet,
    acceptSpriteSheet,
    cancelSpriteSheet,
    adoptRecovered,
    acceptConversion,
    openOriginal,
    cancelConversion,
    importPalette,
    exportPalette,
  }
}
