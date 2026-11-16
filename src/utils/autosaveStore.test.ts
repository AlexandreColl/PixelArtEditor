// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args), isTauri: () => false }))

const { AUTOSAVE_KEY, browserStore, fileStore } = await import('./autosaveStore')

beforeEach(() => {
  invoke.mockReset()
  localStorage.clear()
})

describe('fileStore', () => {
  it('reads the file written by the app', async () => {
    invoke.mockResolvedValueOnce('from file')
    localStorage.setItem(AUTOSAVE_KEY, 'from 0.5.0')
    expect(await fileStore.read()).toBe('from file')
    expect(invoke).toHaveBeenCalledWith('read_autosave')
  })

  it('still offers a copy that 0.5.0 left in local storage', async () => {
    invoke.mockResolvedValueOnce(null)
    localStorage.setItem(AUTOSAVE_KEY, 'from 0.5.0')
    expect(await fileStore.read()).toBe('from 0.5.0')
  })

  it('writes the file and removes both copies', async () => {
    invoke.mockResolvedValue(null)
    await fileStore.write('work')
    expect(invoke).toHaveBeenCalledWith('write_autosave', { contents: 'work' })
    localStorage.setItem(AUTOSAVE_KEY, 'from 0.5.0')
    await fileStore.remove()
    expect(invoke).toHaveBeenCalledWith('delete_autosave')
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
  })
})

describe('browserStore', () => {
  it('keeps the copy in local storage', async () => {
    await browserStore.write('work')
    expect(await browserStore.read()).toBe('work')
    await browserStore.remove()
    expect(await browserStore.read()).toBeNull()
  })
})
