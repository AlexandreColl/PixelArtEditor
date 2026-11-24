// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'
import { CHECK_DELAY, updateNotes, useUpdater } from './useUpdater'

vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))

function fakeUpdate(install: (onEvent: (e: DownloadEvent) => void) => Promise<void> = async () => {}) {
  return {
    version: '0.6.0',
    currentVersion: '0.5.2',
    body: '### Añadido\n\n- Actualizaciones\n\n---\n\n**Verificar la descarga.**',
    downloadAndInstall: vi.fn(install),
    close: vi.fn(async () => {}),
  } as unknown as Update
}

function setup(check: () => Promise<Update | null>, checkOnStart = false) {
  const calls: string[] = []
  const showToast = vi.fn()
  const beforeInstall = vi.fn(async () => void calls.push('beforeInstall'))
  const relaunch = vi.fn(async () => void calls.push('relaunch'))
  const hook = renderHook(() => useUpdater({ beforeInstall, showToast, check, relaunch, checkOnStart }))
  return { ...hook, calls, showToast, beforeInstall, relaunch }
}

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useUpdater', () => {
  it('checks a little after start and offers the new version', async () => {
    const check = vi.fn(async () => fakeUpdate())
    const { result } = setup(check, true)
    await flush()
    expect(check).not.toHaveBeenCalled()
    await act(async () => void (await vi.advanceTimersByTimeAsync(CHECK_DELAY)))
    expect(result.current.status).toEqual({
      phase: 'available',
      version: '0.6.0',
      currentVersion: '0.5.2',
      notes: '### Añadido\n\n- Actualizaciones',
    })
  })

  it('stays quiet when the check on start fails, and says so when asked', async () => {
    const check = vi.fn(async () => {
      throw new Error('offline')
    })
    const { result, showToast } = setup(check, true)
    await act(async () => void (await vi.advanceTimersByTimeAsync(CHECK_DELAY)))
    expect(showToast).not.toHaveBeenCalled()
    await act(() => result.current.checkNow())
    expect(showToast).toHaveBeenCalledWith('Could not check for updates')
    expect(result.current.status.phase).toBe('idle')
  })

  it('says it is up to date only when asked', async () => {
    const { result, showToast } = setup(async () => null)
    await act(() => result.current.checkNow())
    expect(showToast).toHaveBeenCalledWith('Pixel Art Editor is up to date')
  })

  it('keeps unsaved work before installing, shows the progress and restarts', async () => {
    let finish: () => void = () => {}
    const update = fakeUpdate(async onEvent => {
      onEvent({ event: 'Started', data: { contentLength: 200 } })
      onEvent({ event: 'Progress', data: { chunkLength: 50 } })
      await new Promise<void>(r => (finish = r))
      onEvent({ event: 'Finished' })
    })
    const hook = setup(async () => update)
    await act(() => hook.result.current.checkNow())
    let installing: Promise<void> = Promise.resolve()
    act(() => {
      installing = hook.result.current.install()
    })
    await flush()
    expect(hook.result.current.status).toMatchObject({ phase: 'installing', progress: 0.25 })
    expect(hook.calls).toEqual(['beforeInstall'])
    await act(async () => {
      finish()
      await installing
    })
    expect(hook.calls).toEqual(['beforeInstall', 'relaunch'])
    expect(update.downloadAndInstall).toHaveBeenCalledOnce()
  })

  it('offers the update again when installing fails', async () => {
    const update = fakeUpdate(async () => {
      throw new Error('bad signature')
    })
    const { result, showToast, relaunch } = setup(async () => update)
    await act(() => result.current.checkNow())
    await act(() => result.current.install())
    expect(relaunch).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('The update could not be installed')
    expect(result.current.status.phase).toBe('available')
  })

  it('can be put off until the next start', async () => {
    const { result } = setup(async () => fakeUpdate())
    await act(() => result.current.checkNow())
    act(() => result.current.dismiss())
    expect(result.current.status.phase).toBe('idle')
  })
})

describe('updateNotes', () => {
  it('keeps what changed and drops the verification footer', () => {
    expect(updateNotes('- Uno\n\n---\n\nfooter')).toBe('- Uno')
    expect(updateNotes(undefined)).toBe('')
  })
})
