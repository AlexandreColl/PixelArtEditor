import { useCallback, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { MAX_ORIGINAL_SIZE } from '../components/ConvertDialog'
import type { ExportOptions } from '../components/ExportDialog'
import type { Palette, PixelData } from '../types'
import { TRANSPARENT } from '../utils/color'
import { fileBaseName, imageDataToPixels, loadImageFile, needsConversion, withExtension } from '../utils/image'
import { PALETTE_EXTENSIONS, formatForPath, parsePalette, serializePalette } from '../utils/palette'
import { pixelsToPngDataUrl } from '../utils/png'
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
  /** The frame being edited, which Export PNG writes */
  pixelData: PixelData
  frames: PixelData[]
  fps: number
  importFrames: (frames: string[][][], width: number, height: number, fps?: number) => void
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
  pixelData,
  frames,
  fps,
  importFrames,
  palette,
  replacePalette,
  showToast,
}: FileActionsOptions) {
  // Where Save writes without asking; null until the image is saved or opened from a PNG
  const filePathRef = useRef<string | null>(null)
  const [fileName, setFileName] = useState('untitled')
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  // An image waiting for its frame size in the sprite sheet dialog
  const [pendingSheet, setPendingSheet] = useState<{ image: ImageData; name: string } | null>(null)

  const setFile = useCallback((path: string | null, name: string) => {
    filePathRef.current = path
    setFileName(name)
  }, [])

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
        importFrames(animation.frames, info.frameWidth, info.frameHeight, info.fps)
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
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        openImage(await loadImageFile(file), fileBaseName(file.name), null, forceConvert, bytes)
      } catch {
        showToast('Could not open image')
      }
    },
    [openImage, showToast],
  )

  const openWithDialog = useCallback(async () => {
    try {
      const fp = await open({
        filters: [{ name: 'Images', extensions: ['png', 'gif', 'jpeg', 'jpg'] }],
        multiple: false,
        fileAccessMode: 'scoped',
      })
      if (!fp) return
      const data = await readFile(fp)
      const image = await loadImageFile(new File([new Blob([data])], fp.split(/[\\/]/).pop() || 'image.png'))
      // Saving always writes PNG, so only overwrite the original when it is a PNG
      openImage(image, fileBaseName(fp), /\.png$/i.test(fp) ? fp : null, false, data)
    } catch {
      showToast('Could not open image')
    }
  }, [openImage, showToast])

  const saveTo = useCallback(
    async (filePath: string) => {
      try {
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
          })
        } else {
          await savePngFile(frames[0], filePath)
        }
        const name = fileBaseName(filePath)
        setFile(filePath, name)
        showToast(frames.length > 1 ? `Saved ${frames.length} frames as ${name}.png` : `Saved as ${name}.png`)
      } catch (err) {
        showToast('Save failed')
        console.error(err)
      }
    },
    [frames, fps, setFile, showToast],
  )

  const saveImage = useCallback(async () => {
    if (filePathRef.current) {
      await saveTo(filePathRef.current)
      return
    }
    const fp = await save({ filters: [{ name: 'PNG Image', extensions: ['png'] }], defaultPath: `${fileName}.png` })
    if (fp) await saveTo(withExtension(fp, 'png'))
  }, [saveTo, fileName])

  /**
   * Writes the current frame or a sprite sheet, scaled, as a new file;
   * unlike Save it leaves the current file path and name alone.
   */
  const exportImage = useCallback(
    async ({ kind, scale, columns }: ExportOptions) => {
      try {
        const suffix = (kind === 'sheet' ? '-sheet' : '') + (scale > 1 ? `@${scale}x` : '')
        const fp = await save({
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
          defaultPath: `${fileName}${suffix}.png`,
        })
        if (!fp) return
        const path = withExtension(fp, 'png')
        if (kind === 'frame') {
          await savePngFile(pixelData, path, scale)
          showToast(`Exported ${pixelData.width * scale}x${pixelData.height * scale} PNG`)
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
    [pixelData, frames, fps, fileName, showToast],
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
    pendingImage,
    pendingSheet,
    newCanvas,
    openFile,
    openWithDialog,
    saveImage,
    exportImage,
    openSpriteSheet,
    acceptSpriteSheet,
    cancelSpriteSheet,
    acceptConversion,
    openOriginal,
    cancelConversion,
    importPalette,
    exportPalette,
  }
}
