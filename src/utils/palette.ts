import type { Palette } from '../types'
import { TRANSPARENT, normalizeColor, parseColor } from './color'
import { nearest, type RGB } from './pixelate'

/** Large enough for any real pixel art palette, small enough to keep the panel usable. */
export const MAX_PALETTE_COLORS = 256

/** Opaque, canonical and without duplicates, so colors compare by string and palettes stay valid. */
export function cleanColors(colors: unknown[]): string[] {
  const seen = new Set<string>()
  for (const c of colors) {
    const color = normalizeColor(c)
    if (color && color.startsWith('#')) seen.add(color)
    if (seen.size === MAX_PALETTE_COLORS) break
  }
  return [...seen]
}

export type PaletteFormat = 'gpl' | 'hex'

export const PALETTE_EXTENSIONS: PaletteFormat[] = ['gpl', 'hex']

const baseName = (fileName: string) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '') || 'Imported'

/**
 * GIMP palette (also used by Aseprite, Krita and Inkscape): a "GIMP Palette" header, optional Name and Columns
 * lines, # comments, then one "R G B [name]" line per color.
 */
function parseGpl(text: string): { name: string | null; colors: string[] } {
  let name: string | null = null
  const colors: string[] = []
  for (const raw of text.split(/\r?\n/).slice(1)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const header = line.match(/^(\w+):\s*(.*)$/)
    if (header) {
      if (header[1].toLowerCase() === 'name' && header[2]) name = header[2]
      continue
    }
    const rgb = line.match(/^(\d+)\s+(\d+)\s+(\d+)/)
    if (rgb) colors.push(`rgb(${rgb[1]},${rgb[2]},${rgb[3]})`)
  }
  return { name, colors }
}

/** Lospec .hex: one rrggbb per line, with or without the leading #. */
function parseHex(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^#?[0-9a-f]{6}$/i.test(line))
    .map(line => (line.startsWith('#') ? line : `#${line}`))
}

/** Reads a .gpl or .hex palette. Throws with a readable message when the file holds no usable colors. */
export function parsePalette(text: string, fileName: string): Palette {
  const content = text.replace(/^﻿/, '')
  const isGpl = /^GIMP Palette\b/i.test(content.trimStart())
  if (!isGpl && /\.gpl$/i.test(fileName)) throw new Error('Not a GIMP palette: the "GIMP Palette" header is missing')

  const parsed = isGpl ? parseGpl(content.trimStart()) : { name: null, colors: parseHex(content) }
  const colors = cleanColors(parsed.colors)
  if (colors.length === 0) throw new Error('No colors found in the palette file')
  return { name: parsed.name ?? baseName(fileName), colors }
}

export function serializePalette(palette: Palette, format: PaletteFormat): string {
  if (format === 'hex') return palette.colors.map(c => c.slice(1)).join('\n') + '\n'

  const lines = ['GIMP Palette', `Name: ${palette.name.replace(/[\r\n]+/g, ' ')}`, 'Columns: 8', '#']
  for (const color of palette.colors) {
    const [r, g, b] = parseColor(color) ?? [0, 0, 0]
    const channels = [r, g, b].map(n => String(n).padStart(3, ' ')).join(' ')
    lines.push(`${channels}\t${color}`)
  }
  return lines.join('\n') + '\n'
}

/** Format for a path chosen in the save dialog, from its extension (GIMP palette when it has none). */
export function formatForPath(path: string): PaletteFormat {
  return /\.hex$/i.test(path) ? 'hex' : 'gpl'
}

/**
 * Returns a function that maps any color to the nearest palette color, so what is drawn stays in the palette.
 * Mostly transparent pixels become fully transparent; colors it cannot read are returned unchanged.
 */
export function paletteSnapper(colors: string[]): (color: string) => string {
  // nearest() returns one of these arrays, so it can be looked up by reference
  const toColor = new Map<RGB, string>()
  for (const color of colors) {
    const c = parseColor(color)
    if (c) toColor.set([c[0], c[1], c[2]], color)
  }
  const palette = [...toColor.keys()]
  // Drawing and remapping a canvas ask for the same few colors over and over
  const cache = new Map<string, string>()
  return color => {
    const cached = cache.get(color)
    if (cached !== undefined) return cached
    const c = parseColor(color)
    let result = color
    if (c && palette.length > 0) {
      result = c[3] < 128 ? TRANSPARENT : toColor.get(nearest(palette, c[0], c[1], c[2]))!
    }
    cache.set(color, result)
    return result
  }
}
