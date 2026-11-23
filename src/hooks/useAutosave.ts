import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Layer, PixelData } from '../types'
import type { EditorDocument } from './useEditor'
import { type AutosaveStore, defaultAutosaveStore } from '../utils/autosaveStore'
import { parseProject, serializeProject } from '../utils/project'
import type { FrameDuration } from '../utils/timing'

/** Wait this long after the last change, so a stroke in progress is not written on every pointer move */
export const AUTOSAVE_DELAY = 2000

interface AutosaveOptions {
  cels: PixelData[][]
  layers: Layer[]
  fps: number
  durations?: FrameDuration[]
  fileName: string
  /** Only unsaved work is kept: once the file is saved there is nothing to recover */
  isDirty: boolean
  /** Where the copy goes; by default a file in the app data folder, or local storage in a browser */
  store?: AutosaveStore
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

function parseStored(raw: string): Recovery | null {
  try {
    const stored: StoredAutosave = JSON.parse(raw)
    return { savedAt: new Date(stored.savedAt), fileName: stored.fileName, doc: parseProject(stored.project) }
  } catch {
    return null
  }
}

/**
 * Keeps a copy of unsaved work and, on start, offers to recover what a crash or an accidental
 * close left behind. The copy is removed as soon as there are no unsaved changes.
 */
export function useAutosave({ cels, layers, fps, durations, fileName, isDirty, store }: AutosaveOptions) {
  const storeRef = useRef<AutosaveStore>(store ?? defaultAutosaveStore())
  // Nothing is written until the copy left last time has been read, or while it is being offered,
  // so that copy can't be overwritten before the user decides what to do with it
  const [phase, setPhase] = useState<'checking' | 'offering' | 'active'>('checking')
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  // Store calls run one at a time, in order: a slow write can't land after the removal that follows it
  const queue = useRef<Promise<void>>(Promise.resolve())
  const hasCopy = useRef(false)
  const pending = useRef<(() => Promise<void>) | null>(null)

  const enqueue = useCallback((op: () => Promise<void>) => {
    queue.current = queue.current.then(op).catch(err => {
      // The work is still in the editor; only the safety copy is missing
      console.warn('Autosave failed', err)
    })
    return queue.current
  }, [])

  const removeCopy = useCallback(() => {
    if (!hasCopy.current) return
    hasCopy.current = false
    enqueue(() => storeRef.current.remove())
  }, [enqueue])

  useEffect(() => {
    let cancelled = false
    storeRef.current
      .read()
      .then(raw => {
        if (cancelled) return
        hasCopy.current = raw !== null
        const found = raw === null ? null : parseStored(raw)
        // Unreadable: nothing worth offering, and it would be offered again on every start
        if (raw !== null && !found) removeCopy()
        setRecovery(found)
        setPhase(found ? 'offering' : 'active')
      })
      .catch(err => {
        console.warn('Could not read the autosave', err)
        if (!cancelled) setPhase('active')
      })
    return () => {
      cancelled = true
    }
  }, [removeCopy])

  useEffect(() => {
    pending.current = null
    if (phase !== 'active') return
    if (!isDirty) {
      removeCopy()
      return
    }
    const write = () => {
      pending.current = null
      const doc: EditorDocument = {
        width: cels[0][0].width,
        height: cels[0][0].height,
        fps,
        durations,
        layers,
        cels: cels.map(row => row.map(cel => cel.pixels)),
      }
      const stored: StoredAutosave = { savedAt: new Date().toISOString(), fileName, project: serializeProject(doc) }
      const contents = JSON.stringify(stored)
      hasCopy.current = true
      return enqueue(() => storeRef.current.write(contents))
    }
    pending.current = write
    const id = window.setTimeout(write, AUTOSAVE_DELAY)
    return () => window.clearTimeout(id)
  }, [cels, layers, fps, durations, fileName, isDirty, phase, enqueue, removeCopy])

  /** Writes what is pending now instead of after the pause, and resolves once it is stored. */
  const flush = useCallback(() => pending.current?.() ?? queue.current, [])

  // Closing must not lose the last seconds of work: write what is pending, and wait for it
  useEffect(() => {
    const onPageHide = () => void flush()
    window.addEventListener('pagehide', onPageHide)
    // In the desktop app the window waits for the handler before closing
    let unlisten: (() => void) | null = null
    let disposed = false
    if (isTauri()) {
      getCurrentWindow()
        .onCloseRequested(() => flush())
        .then(fn => (disposed ? fn() : (unlisten = fn)))
        .catch(err => console.warn('Could not watch the window closing', err))
    }
    return () => {
      disposed = true
      window.removeEventListener('pagehide', onPageHide)
      unlisten?.()
    }
  }, [flush])

  /** Hands over the recovered work and starts autosaving again. */
  const takeRecovery = useCallback(() => {
    const r = recovery
    setRecovery(null)
    setPhase('active')
    return r
  }, [recovery])

  const discardRecovery = useCallback(() => {
    removeCopy()
    setRecovery(null)
    setPhase('active')
  }, [removeCopy])

  return { recovery, takeRecovery, discardRecovery, flush }
}
