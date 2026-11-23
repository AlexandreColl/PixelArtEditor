// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Layer, PixelData } from '../types'
import { AUTOSAVE_DELAY, useAutosave } from './useAutosave'
import type { AutosaveStore } from '../utils/autosaveStore'
import { serializeProject } from '../utils/project'

const layers: Layer[] = [{ id: 1, name: 'Layer 1', visible: true, opacity: 1 }]
const cel = (color: string): PixelData => ({ width: 1, height: 1, pixels: [[color]] })

/** A store in memory; `read` can be held back to test what happens before it answers. */
function memoryStore(initial: string | null = null) {
  let value = initial
  let releaseRead: () => void = () => {}
  const readGate = new Promise<void>(r => (releaseRead = r))
  const store: AutosaveStore & { [k in keyof AutosaveStore]: ReturnType<typeof vi.fn> } = {
    read: vi.fn(async () => {
      await readGate
      return value
    }),
    write: vi.fn(async (contents: string) => {
      value = contents
    }),
    remove: vi.fn(async () => {
      value = null
    }),
  }
  return { store, get: () => value, releaseRead }
}

function setup(store: AutosaveStore, initial: { color?: string; isDirty?: boolean } = {}) {
  return renderHook(
    ({ color, isDirty }) => useAutosave({ cels: [[cel(color)]], layers, fps: 8, fileName: 'hero', isDirty, store }),
    { initialProps: { color: initial.color ?? '#ff0000', isDirty: initial.isDirty ?? true } },
  )
}

const left = (fileName = 'old', color = '#0000ff') =>
  JSON.stringify({
    savedAt: '2026-11-15T10:00:00.000Z',
    fileName,
    project: serializeProject({ width: 1, height: 1, fps: 8, layers, cels: [[[[color]]]] }),
  })

/** Lets pending promises and timers run. */
const tick = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useAutosave', () => {
  it('does not write before it has read what was left last time', async () => {
    const { store, releaseRead } = memoryStore()
    setup(store)
    await tick(AUTOSAVE_DELAY * 2)
    expect(store.write).not.toHaveBeenCalled()
    releaseRead()
    // The pause starts once the read has answered
    await tick()
    await tick(AUTOSAVE_DELAY)
    expect(store.write).toHaveBeenCalledOnce()
  })

  it('writes unsaved work after a pause, not on every change', async () => {
    const { store, get, releaseRead } = memoryStore()
    releaseRead()
    const { rerender } = setup(store)
    await tick(AUTOSAVE_DELAY - 100)
    rerender({ color: '#00ff00', isDirty: true })
    await tick(AUTOSAVE_DELAY - 100)
    expect(store.write).not.toHaveBeenCalled()
    await tick(200)
    const saved = JSON.parse(get()!)
    expect(saved.fileName).toBe('hero')
    expect(saved.project).toContain('#00ff00')
  })

  it('removes the copy once there are no unsaved changes, and only if there is one', async () => {
    const { store, get, releaseRead } = memoryStore()
    releaseRead()
    const { rerender } = setup(store, { isDirty: false })
    await tick()
    expect(store.remove).not.toHaveBeenCalled()
    rerender({ color: '#ff0000', isDirty: true })
    await tick(AUTOSAVE_DELAY)
    expect(get()).not.toBeNull()
    rerender({ color: '#ff0000', isDirty: false })
    await tick()
    expect(get()).toBeNull()
  })

  it('removes after a write that is still in progress, not before it', async () => {
    const { store, get, releaseRead } = memoryStore()
    releaseRead()
    let value: string | null = null
    store.write.mockImplementation(async (contents: string) => {
      await new Promise(r => setTimeout(r, 500))
      value = contents
    })
    store.remove.mockImplementation(async () => {
      value = null
    })
    const { rerender } = setup(store)
    await tick(AUTOSAVE_DELAY)
    rerender({ color: '#ff0000', isDirty: false })
    await tick(1000)
    expect(value).toBeNull()
    expect(get()).toBeNull()
  })

  it('writes straight away when the window closes', async () => {
    const { store, releaseRead } = memoryStore()
    releaseRead()
    setup(store)
    await tick()
    act(() => void window.dispatchEvent(new Event('pagehide')))
    await tick()
    expect(store.write).toHaveBeenCalledOnce()
  })

  it('writes straight away when asked to, such as before installing an update', async () => {
    const { store, get, releaseRead } = memoryStore()
    releaseRead()
    const { result } = setup(store)
    await tick()
    await act(() => result.current.flush())
    expect(get()).toContain('#ff0000')
  })

  it('offers what was left, and does not overwrite it while offered', async () => {
    const { store, releaseRead } = memoryStore(left())
    releaseRead()
    const { result } = setup(store)
    await tick(AUTOSAVE_DELAY * 2)
    expect(result.current.recovery?.fileName).toBe('old')
    expect(result.current.recovery?.doc.cels[0][0]).toEqual([['#0000ff']])
    expect(store.write).not.toHaveBeenCalled()

    let taken
    act(() => {
      taken = result.current.takeRecovery()
    })
    expect(taken).not.toBeNull()
    expect(result.current.recovery).toBeNull()
    await tick(AUTOSAVE_DELAY)
    expect(store.write).toHaveBeenCalledOnce()
  })

  it('deletes the copy when the recovery is discarded', async () => {
    const { store, get, releaseRead } = memoryStore(left())
    releaseRead()
    const { result } = setup(store, { isDirty: false })
    await tick()
    act(() => result.current.discardRecovery())
    await tick()
    expect(get()).toBeNull()
    expect(result.current.recovery).toBeNull()
  })

  it('drops a copy that cannot be read instead of offering it', async () => {
    const { store, get, releaseRead } = memoryStore('{broken')
    releaseRead()
    const { result } = setup(store, { isDirty: false })
    await tick()
    expect(result.current.recovery).toBeNull()
    expect(get()).toBeNull()
  })

  it('keeps working when the store fails', async () => {
    const { store, releaseRead } = memoryStore()
    releaseRead()
    store.write.mockRejectedValueOnce(new Error('disk full'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { rerender } = setup(store)
    await tick()
    await tick(AUTOSAVE_DELAY)
    rerender({ color: '#00ff00', isDirty: true })
    await tick(AUTOSAVE_DELAY)
    expect(store.write).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith('Autosave failed', expect.any(Error))
    warn.mockRestore()
  })
})
