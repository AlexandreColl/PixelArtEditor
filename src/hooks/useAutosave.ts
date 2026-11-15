import { useCallback, useEffect, useRef, useState } from 'react'
import type { Layer, PixelData } from '../types'
import type { EditorDocument } from './useEditor'
import { parseProject, serializeProject } from '../utils/project'

export const AUTOSAVE_KEY = 'autosave'
/** Wait this long after the last change, so a stroke in progress is not written on every pointer move */
export const AUTOSAVE_DELAY = 2000

interface AutosaveOptions {
  cels: PixelData[][]
  layers: Layer[]
  fps: number
  fileName: string
  /** Only unsaved work is kept: once the file is saved there is nothing to recover */
  isDirty: boolean
}

interface StoredAutosave {
  savedAt: string
  fileName: string
  project: string
}

export interface Recovery {
  savedAt: Date
  fileName: string
  doc: EditorDocument
}

function readStored(): Recovery | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const stored: StoredAutosave = JSON.parse(raw)
    return { savedAt: new Date(stored.savedAt), fileName: stored.fileName, doc: parseProject(stored.project) }
  } catch {
    // Unreadable: nothing worth offering, and it would be offered again on every start
    localStorage.removeItem(AUTOSAVE_KEY)
    return null
  }
}

/**
 * Keeps a copy of unsaved work in local storage, and on start offers to recover what a crash or
 * an accidental close left behind. The copy is removed as soon as there are no unsaved changes.
 */
export function useAutosave({ cels, layers, fps, fileName, isDirty }: AutosaveOptions) {
  // Read once on start; while it is offered nothing is written, so the copy can't be overwritten
  const [recovery, setRecovery] = useState<Recovery | null>(readStored)
  const pending = useRef<(() => void) | null>(null)

  useEffect(() => {
    pending.current = null
    if (recovery) return
    if (!isDirty) {
      localStorage.removeItem(AUTOSAVE_KEY)
      return
    }
    const write = () => {
      pending.current = null
      const doc: EditorDocument = {
        width: cels[0][0].width,
        height: cels[0][0].height,
        fps,
        layers,
        cels: cels.map(row => row.map(cel => cel.pixels)),
      }
      const stored: StoredAutosave = { savedAt: new Date().toISOString(), fileName, project: serializeProject(doc) }
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(stored))
      } catch (err) {
        // Storage full: the work is still in the editor, only the safety copy is missing
        console.warn('Autosave failed', err)
      }
    }
    pending.current = write
    const id = window.setTimeout(write, AUTOSAVE_DELAY)
    return () => window.clearTimeout(id)
  }, [cels, layers, fps, fileName, isDirty, recovery])

  // Closing the window must not lose the last two seconds of work
  useEffect(() => {
    const flush = () => pending.current?.()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  /** Hands over the recovered work and starts autosaving again. */
  const takeRecovery = useCallback(() => {
    const r = recovery
    setRecovery(null)
    return r
  }, [recovery])

  const discardRecovery = useCallback(() => {
    localStorage.removeItem(AUTOSAVE_KEY)
    setRecovery(null)
  }, [])

  return { recovery, takeRecovery, discardRecovery }
}
