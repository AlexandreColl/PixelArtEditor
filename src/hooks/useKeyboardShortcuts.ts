import { useEffect, useRef } from 'react'

export interface ShortcutActions {
  undo: () => void
  redo: () => void
  save: () => void
  open: () => void
  fit: () => void
  toggleGrid: () => void
  copy: () => void
  cut: () => void
  paste: () => void
  selectAll: () => void
  /** Returns false when there is nothing selected, so the key keeps its default behaviour. */
  remove: () => boolean
  deselect: () => void
  /** Returns false when there is nothing selected, so the arrows can still scroll. */
  nudge: (dx: number, dy: number) => boolean
}

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Ctrl (or Cmd) shortcuts; keys are lower case because Shift and Caps Lock change e.key. */
const CTRL_SHORTCUTS: Record<string, (a: ShortcutActions, shift: boolean) => void> = {
  c: a => a.copy(),
  x: a => a.cut(),
  v: a => a.paste(),
  a: a => a.selectAll(),
  '0': a => a.fit(),
  z: (a, shift) => (shift ? a.redo() : a.undo()),
  y: a => a.redo(),
  s: a => a.save(),
  o: a => a.open(),
}

/** True when the key belongs to whatever has focus: a text field, or a modal dialog. */
function keyIsTaken(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return true
  return document.querySelector('[role="dialog"]') !== null
}

/** The editor's global shortcuts. The actions can change on every render; the listener is registered once. */
export function useKeyboardShortcuts(actions: ShortcutActions) {
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (keyIsTaken(e)) return
      const a = actionsRef.current
      const key = e.key.toLowerCase()

      if (e.ctrlKey || e.metaKey) {
        const shortcut = CTRL_SHORTCUTS[key]
        if (!shortcut) return
        e.preventDefault()
        shortcut(a, e.shiftKey)
        return
      }

      if (key === 'g' && !e.altKey && !e.shiftKey) {
        a.toggleGrid()
      } else if (e.key === 'Delete') {
        if (a.remove()) e.preventDefault()
      } else if (e.key === 'Escape') {
        a.deselect()
      } else if (e.key in ARROW_STEPS) {
        const [dx, dy] = ARROW_STEPS[e.key]
        if (a.nudge(dx, dy)) e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])
}
