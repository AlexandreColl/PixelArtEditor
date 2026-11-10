import { useCallback, useEffect, useState } from 'react'
import type { Palette } from '../types'
import { MAX_PALETTE_COLORS, cleanColors } from '../utils/palette'

export const DEFAULT_PALETTE_NAME = 'Default'

export const DEFAULT_PALETTE = [
  '#000000',
  '#ffffff',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#808080',
  '#800000',
  '#008000',
  '#000080',
  '#808000',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#ff8800',
  '#88ff00',
  '#0088ff',
  '#ff0088',
]

const STORAGE_KEY = 'palette'
const LOCK_KEY = 'palette_locked'

function loadPalette(): Palette {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    const colors = cleanColors(Array.isArray(stored?.colors) ? stored.colors : [])
    if (colors.length > 0) {
      return { name: typeof stored.name === 'string' ? stored.name : DEFAULT_PALETTE_NAME, colors }
    }
  } catch {
    // Unreadable or blocked storage: fall back to the default palette
  }
  return { name: DEFAULT_PALETTE_NAME, colors: DEFAULT_PALETTE }
}

/** The swatches in the color panel, kept between sessions. */
export function usePalette() {
  const [palette, setPalette] = useState<Palette>(loadPalette)
  // While locked, everything drawn is mapped to the nearest palette color
  const [locked, setLocked] = useState(() => {
    try {
      return localStorage.getItem(LOCK_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(palette))
    } catch {
      // The palette still works for this session
    }
  }, [palette])

  useEffect(() => {
    try {
      localStorage.setItem(LOCK_KEY, String(locked))
    } catch {
      // The lock still works for this session
    }
  }, [locked])

  const toggleLocked = useCallback(() => setLocked(prev => !prev), [])

  /** Adds a color at the end. Returns false if it is already there, invalid, or the palette is full. */
  const addColor = useCallback(
    (color: string): boolean => {
      const [clean] = cleanColors([color])
      if (!clean || palette.colors.includes(clean) || palette.colors.length >= MAX_PALETTE_COLORS) return false
      setPalette(prev => ({ ...prev, colors: [...prev.colors, clean] }))
      return true
    },
    [palette.colors],
  )

  /** Removes a color, keeping at least one so there is always something to draw with. */
  const removeColor = useCallback((color: string) => {
    setPalette(prev => (prev.colors.length <= 1 ? prev : { ...prev, colors: prev.colors.filter(c => c !== color) }))
  }, [])

  /** Moves the color at index `from` so it ends up at index `to`. */
  const moveColor = useCallback((from: number, to: number) => {
    setPalette(prev => {
      const n = prev.colors.length
      if (from === to || from < 0 || from >= n || to < 0 || to >= n) return prev
      const colors = [...prev.colors]
      const [moved] = colors.splice(from, 1)
      colors.splice(to, 0, moved)
      return { ...prev, colors }
    })
  }, [])

  /** Replaces the whole palette. Returns false, and keeps the current one, if no valid color is left. */
  const replacePalette = useCallback((name: string, colors: unknown[]): boolean => {
    const clean = cleanColors(colors)
    if (clean.length === 0) return false
    setPalette({ name, colors: clean })
    return true
  }, [])

  const resetPalette = useCallback(() => {
    setPalette({ name: DEFAULT_PALETTE_NAME, colors: DEFAULT_PALETTE })
  }, [])

  return { palette, locked, toggleLocked, addColor, removeColor, moveColor, replacePalette, resetPalette }
}
