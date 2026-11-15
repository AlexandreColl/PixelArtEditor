// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Layer, PixelData } from '../types'
import { AUTOSAVE_DELAY, AUTOSAVE_KEY, useAutosave } from './useAutosave'
import { serializeProject } from '../utils/project'

const layers: Layer[] = [{ id: 1, name: 'Layer 1', visible: true, opacity: 1 }]
const cel = (color: string): PixelData => ({ width: 1, height: 1, pixels: [[color]] })

function setup(initial: { color?: string; isDirty?: boolean } = {}) {
  return renderHook(
    ({ color, isDirty }) => useAutosave({ cels: [[cel(color)]], layers, fps: 8, fileName: 'hero', isDirty }),
    { initialProps: { color: initial.color ?? '#ff0000', isDirty: initial.isDirty ?? true } },
  )
}

const stored = () => localStorage.getItem(AUTOSAVE_KEY)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useAutosave', () => {
  it('writes unsaved work after a pause, not on every change', () => {
    const { rerender } = setup()
    act(() => void vi.advanceTimersByTime(AUTOSAVE_DELAY - 100))
    rerender({ color: '#00ff00', isDirty: true })
    act(() => void vi.advanceTimersByTime(AUTOSAVE_DELAY - 100))
    expect(stored()).toBeNull()
    act(() => void vi.advanceTimersByTime(200))
    const saved = JSON.parse(stored()!)
    expect(saved.fileName).toBe('hero')
    expect(saved.project).toContain('#00ff00')
  })

  it('removes the copy once there are no unsaved changes', () => {
    const { rerender } = setup()
    act(() => void vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(stored()).not.toBeNull()
    rerender({ color: '#ff0000', isDirty: false })
    expect(stored()).toBeNull()
  })

  it('writes straight away when the window closes', () => {
    setup()
    act(() => void window.dispatchEvent(new Event('pagehide')))
    expect(stored()).not.toBeNull()
  })

  it('offers what was left on start, and does not overwrite it while offered', () => {
    const project = serializeProject({
      width: 1,
      height: 1,
      fps: 8,
      layers,
      cels: [[[['#0000ff']]]],
    })
    const left = JSON.stringify({ savedAt: '2026-11-15T10:00:00.000Z', fileName: 'old', project })
    localStorage.setItem(AUTOSAVE_KEY, left)
    const { result } = setup({ isDirty: false })
    expect(result.current.recovery?.fileName).toBe('old')
    expect(result.current.recovery?.doc.cels[0][0]).toEqual([['#0000ff']])
    expect(stored()).toBe(left)

    let taken
    act(() => {
      taken = result.current.takeRecovery()
    })
    expect(taken).not.toBeNull()
    expect(result.current.recovery).toBeNull()
  })

  it('deletes the copy when the recovery is discarded', () => {
    const project = serializeProject({ width: 1, height: 1, fps: 8, layers, cels: [[[['#0000ff']]]] })
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), fileName: 'x', project }))
    const { result } = setup()
    act(() => result.current.discardRecovery())
    expect(stored()).toBeNull()
    expect(result.current.recovery).toBeNull()
  })

  it('drops a copy that cannot be read instead of offering it', () => {
    localStorage.setItem(AUTOSAVE_KEY, '{broken')
    const { result } = setup({ isDirty: false })
    expect(result.current.recovery).toBeNull()
    expect(stored()).toBeNull()
  })
})
