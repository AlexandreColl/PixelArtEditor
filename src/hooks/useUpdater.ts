import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { type DownloadEvent, type Update, check as checkForUpdate } from '@tauri-apps/plugin-updater'
import { relaunch as relaunchApp } from '@tauri-apps/plugin-process'

/** Wait a little after start, so checking never competes with opening the editor */
export const CHECK_DELAY = 3000

export type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'available'; version: string; currentVersion: string; notes: string }
  | { phase: 'installing'; version: string; currentVersion: string; notes: string; progress: number | null }

/** The part of the release notes worth reading in the app: what changed, without the footer. */
export function updateNotes(body: string | undefined): string {
  return (body ?? '').split(/\n---\n/)[0].trim()
}

interface UpdaterOptions {
  /** Runs before installing, which closes the app: the place to keep unsaved work */
  beforeInstall: () => Promise<void>
  showToast: (message: string) => void
  /** Checks on start only in the desktop app's release builds */
  checkOnStart?: boolean
  check?: () => Promise<Update | null>
  relaunch?: () => Promise<void>
}

/**
 * Looks for a newer release on GitHub on start and on demand, and installs it on request.
 * Unsaved work survives the restart through the autosave.
 */
export function useUpdater({
  beforeInstall,
  showToast,
  checkOnStart = isTauri() && !import.meta.env.DEV,
  check = checkForUpdate,
  relaunch = relaunchApp,
}: UpdaterOptions) {
  const [status, setStatus] = useState<UpdateStatus>({ phase: 'idle' })
  const update = useRef<Update | null>(null)
  const busy = useRef(false)

  const find = useCallback(
    async (manual: boolean) => {
      if (busy.current) return
      busy.current = true
      try {
        const found = await check()
        if (!found) {
          if (manual) showToast('Pixel Art Editor is up to date')
          return
        }
        await update.current?.close()
        update.current = found
        setStatus({
          phase: 'available',
          version: found.version,
          currentVersion: found.currentVersion,
          notes: updateNotes(found.body),
        })
      } catch (err) {
        // Offline, or a build that can't update itself (such as a .deb): only say so when asked
        console.warn('Update check failed', err)
        if (manual) showToast('Could not check for updates')
      } finally {
        busy.current = false
      }
    },
    [check, showToast],
  )

  useEffect(() => {
    if (!checkOnStart) return
    const id = window.setTimeout(() => void find(false), CHECK_DELAY)
    return () => window.clearTimeout(id)
  }, [checkOnStart, find])

  const checkNow = useCallback(() => find(true), [find])

  const dismiss = useCallback(() => {
    setStatus({ phase: 'idle' })
  }, [])

  const install = useCallback(async () => {
    const found = update.current
    if (!found || status.phase !== 'available') return
    let total: number | null = null
    let received = 0
    setStatus({ ...status, phase: 'installing', progress: null })
    try {
      await beforeInstall()
      await found.downloadAndInstall((e: DownloadEvent) => {
        if (e.event === 'Started') total = e.data.contentLength ?? null
        else if (e.event === 'Progress') {
          received += e.data.chunkLength
          if (total) setStatus(s => (s.phase === 'installing' ? { ...s, progress: Math.min(1, received / total!) } : s))
        }
      })
      await relaunch()
    } catch (err) {
      console.warn('Update failed', err)
      showToast('The update could not be installed')
      setStatus({ ...status, phase: 'available' })
    }
  }, [status, beforeInstall, relaunch, showToast])

  return { status, checkNow, install, dismiss }
}
