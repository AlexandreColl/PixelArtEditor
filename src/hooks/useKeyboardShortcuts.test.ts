// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useKeyboardShortcuts, type ShortcutActions } from './useKeyboardShortcuts'

function setup(overrides: Partial<ShortcutActions> = {}) {
  const actions: ShortcutActions = {
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
    open: vi.fn(),
    fit: vi.fn(),
    toggleGrid: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    remove: vi.fn(() => true),
    deselect: vi.fn(),
    nudge: vi.fn(() => true),
    setTool: vi.fn(),
    swapColors: vi.fn(),
    stepFrame: vi.fn(),
    togglePlay: vi.fn(),
    ...overrides,
  }
  const hook = renderHook(props => useKeyboardShortcuts(props), { initialProps: actions })
  return { actions, ...hook }
}

/** Dispatches a keydown on `target` and returns whether the default action was prevented. */
function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

// Unmount after every test, or the listeners of earlier tests would still answer the keys
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('useKeyboardShortcuts', () => {
  it('runs the Ctrl shortcuts and blocks the browser default', () => {
    const { actions } = setup()
    expect(press('s', { ctrlKey: true })).toBe(true)
    press('o', { ctrlKey: true })
    press('0', { ctrlKey: true })
    press('c', { metaKey: true })
    expect(actions.save).toHaveBeenCalledOnce()
    expect(actions.open).toHaveBeenCalledOnce()
    expect(actions.fit).toHaveBeenCalledOnce()
    expect(actions.copy).toHaveBeenCalledOnce()
  })

  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y, whatever the case of the key', () => {
    const { actions } = setup()
    press('z', { ctrlKey: true })
    press('Z', { ctrlKey: true, shiftKey: true })
    press('Y', { ctrlKey: true })
    expect(actions.undo).toHaveBeenCalledOnce()
    expect(actions.redo).toHaveBeenCalledTimes(2)
  })

  it('leaves unknown Ctrl shortcuts to the browser', () => {
    setup()
    expect(press('p', { ctrlKey: true })).toBe(false)
  })

  it('picks tools with single keys, whatever the case', () => {
    const { actions } = setup()
    press('b')
    press('E')
    press('m')
    expect(actions.setTool).toHaveBeenNthCalledWith(1, 'pencil')
    expect(actions.setTool).toHaveBeenNthCalledWith(2, 'eraser')
    expect(actions.setTool).toHaveBeenNthCalledWith(3, 'selection')
  })

  it('does not change tool with Ctrl, Shift or Alt held', () => {
    const { actions } = setup()
    press('b', { shiftKey: true })
    press('e', { altKey: true })
    press('s', { ctrlKey: true })
    expect(actions.setTool).not.toHaveBeenCalled()
    expect(actions.save).toHaveBeenCalledOnce()
  })

  it('swaps the colors with X', () => {
    const { actions } = setup()
    press('x')
    expect(actions.swapColors).toHaveBeenCalledOnce()
    expect(actions.cut).not.toHaveBeenCalled()
  })

  it('toggles the grid with G, but not with Shift+G', () => {
    const { actions } = setup()
    press('g')
    press('G', { shiftKey: true })
    expect(actions.toggleGrid).toHaveBeenCalledOnce()
  })

  it('steps through the frames with comma and period, and plays with P', () => {
    const { actions } = setup()
    press(',')
    press('.')
    press('p')
    expect(actions.stepFrame).toHaveBeenNthCalledWith(1, -1)
    expect(actions.stepFrame).toHaveBeenNthCalledWith(2, 1)
    expect(actions.togglePlay).toHaveBeenCalledOnce()
  })

  it('nudges the selection with the arrows, and lets them scroll when nothing is selected', () => {
    const nudge = vi.fn(() => false)
    setup({ nudge })
    expect(press('ArrowUp')).toBe(false)
    expect(nudge).toHaveBeenCalledWith(0, -1)
  })

  it('deletes and deselects with Delete and Escape', () => {
    const { actions } = setup()
    expect(press('Delete')).toBe(true)
    press('Escape')
    expect(actions.remove).toHaveBeenCalledOnce()
    expect(actions.deselect).toHaveBeenCalledOnce()
  })

  it('ignores keys typed in text fields', () => {
    const { actions } = setup()
    const input = document.body.appendChild(document.createElement('input'))
    expect(press('a', { ctrlKey: true }, input)).toBe(false)
    press('Delete', {}, input)
    expect(actions.selectAll).not.toHaveBeenCalled()
    expect(actions.remove).not.toHaveBeenCalled()
  })

  it('ignores every shortcut while a modal dialog is open', () => {
    const { actions } = setup()
    document.body.appendChild(document.createElement('div')).setAttribute('role', 'dialog')
    press('z', { ctrlKey: true })
    expect(actions.undo).not.toHaveBeenCalled()
  })

  it('uses the latest actions without registering the listener again', () => {
    const { actions, rerender } = setup()
    const save = vi.fn()
    const add = vi.spyOn(window, 'addEventListener')
    rerender({ ...actions, save })
    press('s', { ctrlKey: true })
    expect(save).toHaveBeenCalled()
    expect(add).not.toHaveBeenCalledWith('keydown', expect.anything())
  })
})
