import { useEffect, useRef } from 'react'
import type { Tool } from '../types'

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
  setTool: (tool: Tool) => void
  swapColors: () => void
  /** Goes to the previous (-1) or next (1) frame */
  stepFrame: (direction: 1 | -1) => void
}

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Single-key tool shortcuts, the usual ones in pixel art editors. Shown in the toolbar tooltips. */
export const TOOL_KEYS: Record<Tool, string> = {
  pencil: 'B',
  eraser: 'E',
  fill: 'F',
  picker: 'I',
  line: 'L',
  rect: 'R',
  ellipse: 'O',
  shade: 'S',
  selection: 'M',
}

const TOOL_BY_KEY = Object.fromEntries(
  Object.entries(TOOL_KEYS).map(([tool, key]) => [key.toLowerCase(), tool as Tool]),
)

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

      const plain = !e.altKey && !e.shiftKey
      if (plain && key in TOOL_BY_KEY) {
        a.setTool(TOOL_BY_KEY[key])
      } else if (plain && key === 'x') {
        a.swapColors()
      } else if (plain && key === 'g') {
        a.toggleGrid()
      } else if (plain && (e.key === ',' || e.key === '.')) {
        a.stepFrame(e.key === ',' ? -1 : 1)
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
