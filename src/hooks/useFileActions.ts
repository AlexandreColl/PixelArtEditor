import { useCallback, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { MAX_ORIGINAL_SIZE } from '../components/ConvertDialog'
import type { Palette, PixelData } from '../types'
import { TRANSPARENT } from '../utils/color'
import { fileBaseName, imageDataToPixels, loadImageFile, needsConversion, withExtension } from '../utils/image'
import { PALETTE_EXTENSIONS, formatForPath, parsePalette, serializePalette } from '../utils/palette'
import { pixelsToPngDataUrl } from '../utils/png'

const NEW_CANVAS_SIZE = 32

/** An image waiting in the conversion dialog. */
export interface PendingImage {
  image: ImageData
  name: string
  /** Original file path, only kept when the file is a PNG that can be overwritten on save */
  path: string | null
}

interface FileActionsOptions {
  pixelData: PixelData
  importPixels: (pixels: string[][], width: number, height: number) => void
  palette: Palette
  replacePalette: (name: string, colors: unknown[]) => boolean
  showToast: (message: string) => void
}

async function savePngFile(pixelData: PixelData, filePath: string, scale = 1) {
  const dataUrl = pixelsToPngDataUrl(pixelData.pixels, pixelData.width, pixelData.height, scale)
  await invoke('save_png_file', { path: filePath, base64Data: dataUrl.split(',')[1] })
}

/**
 * Opening, saving and exporting images and palettes, and the image waiting for conversion.
 * Desktop dialogs go through Tauri; dropped and picked File objects work in any webview.
 */
export function useFileActions({ pixelData, importPixels, palette, replacePalette, showToast }: FileActionsOptions) {
  // Where Save writes without asking; null until the image is saved or opened from a PNG
  const filePathRef = useRef<string | null>(null)
  const [fileName, setFileName] = useState('untitled')
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

  const setFile = useCallback((path: string | null, name: string) => {
    filePathRef.current = path
    setFileName(name)
  }, [])

  const newCanvas = useCallback(() => {
    const row = Array<string>(NEW_CANVAS_SIZE).fill(TRANSPARENT)
    importPixels(
      Array.from({ length: NEW_CANVAS_SIZE }, () => [...row]),
      NEW_CANVAS_SIZE,
      NEW_CANVAS_SIZE,
    )
    setFile(null, 'untitled')
    showToast('New canvas created')
  }, [importPixels, setFile, showToast])

  const openImage = useCallback(
    (image: ImageData, name: string, path: string | null, forceConvert = false) => {
      if (forceConvert || needsConversion(image)) {
        setPendingImage({ image, name, path })
        return
      }
      const pd = imageDataToPixels(image)
      importPixels(pd.pixels, pd.width, pd.height)
      setFile(path, name)
    },
    [importPixels, setFile],
  )

  /** Opens a dropped or picked file; it has no path, so the first save asks where to write. */
  const openFile = useCallback(
    async (file: File, forceConvert = false) => {
      try {
        openImage(await loadImageFile(file), fileBaseName(file.name), null, forceConvert)
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
      openImage(image, fileBaseName(fp), /\.png$/i.test(fp) ? fp : null)
    } catch {
      showToast('Could not open image')
    }
  }, [openImage, showToast])

  const saveTo = useCallback(
    async (filePath: string) => {
      try {
        await savePngFile(pixelData, filePath)
        const name = fileBaseName(filePath)
        setFile(filePath, name)
        showToast(`Saved as ${name}.png`)
      } catch (err) {
        showToast('Save failed')
        console.error(err)
      }
    },
    [pixelData, setFile, showToast],
  )

  const saveImage = useCallback(async () => {
    if (filePathRef.current) {
      await saveTo(filePathRef.current)
      return
    }
    const fp = await save({ filters: [{ name: 'PNG Image', extensions: ['png'] }], defaultPath: `${fileName}.png` })
    if (fp) await saveTo(withExtension(fp, 'png'))
  }, [saveTo, fileName])

  /** Saves a scaled copy as a new file; unlike Save it leaves the current file path and name alone. */
  const exportPng = useCallback(
    async (scale: number) => {
      try {
        const fp = await save({
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
          defaultPath: `${fileName}@${scale}x.png`,
        })
        if (!fp) return
        await savePngFile(pixelData, withExtension(fp, 'png'), scale)
        showToast(`Exported ${pixelData.width * scale}x${pixelData.height * scale} PNG`)
      } catch (err) {
        showToast('Export failed')
        console.error(err)
      }
    },
    [pixelData, fileName, showToast],
  )

  const acceptConversion = useCallback(
    (pd: PixelData) => {
      if (!pendingImage) return
      importPixels(pd.pixels, pd.width, pd.height)
      // The result is a new image: never overwrite the source photo on save
      setFile(null, `${pendingImage.name}-pixel`)
      setPendingImage(null)
      showToast(`Converted to ${pd.width}x${pd.height} pixel art`)
    },
    [pendingImage, importPixels, setFile, showToast],
  )

  const openOriginal = useCallback(() => {
    if (!pendingImage || Math.max(pendingImage.image.width, pendingImage.image.height) > MAX_ORIGINAL_SIZE) return
    const pd = imageDataToPixels(pendingImage.image)
    importPixels(pd.pixels, pd.width, pd.height)
    setFile(pendingImage.path, pendingImage.name)
    setPendingImage(null)
  }, [pendingImage, importPixels, setFile])

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
    newCanvas,
    openFile,
    openWithDialog,
    saveImage,
    exportPng,
    acceptConversion,
    openOriginal,
    cancelConversion,
    importPalette,
    exportPalette,
  }
}
