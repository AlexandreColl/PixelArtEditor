// Selections are a rectangle, optionally with a mask of which pixels inside it are selected
// (the magic wand and the lasso make irregular ones). Without a mask the whole rectangle is.
import type { Selection } from '../types'
import { TRANSPARENT } from './color'
import { linePoints } from './shapes'

/** True when pixel (x, y) of the canvas is selected. */
export function isSelected(sel: Selection, x: number, y: number): boolean {
  if (x < sel.x || y < sel.y || x >= sel.x + sel.width || y >= sel.y + sel.height) return false
  return !sel.mask || sel.mask[y - sel.y][x - sel.x]
}

/** The part of a selection inside the canvas, with its mask cropped to match, or null if none is. */
export function clampSelection(sel: Selection, width: number, height: number): Selection | null {
  const x0 = Math.max(0, sel.x)
  const y0 = Math.max(0, sel.y)
  const x1 = Math.min(width, sel.x + sel.width)
  const y1 = Math.min(height, sel.y + sel.height)
  if (x1 <= x0 || y1 <= y0) return null
  const region: Selection = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  if (!sel.mask) return region
  const mask = sel.mask.slice(y0 - sel.y, y1 - sel.y).map(row => row.slice(x0 - sel.x, x1 - sel.x))
  return mask.some(row => row.includes(true)) ? { ...region, mask } : null
}

/** The selected pixels, as a block the size of the selection; unselected ones are transparent. */
export function extractSelected(pixels: string[][], sel: Selection): string[][] {
  return pixels
    .slice(sel.y, sel.y + sel.height)
    .map((row, y) => row.slice(sel.x, sel.x + sel.width).map((c, x) => (!sel.mask || sel.mask[y][x] ? c : TRANSPARENT)))
}

/** A copy of the pixels with the selected ones made transparent; rows outside the selection are shared. */
export function clearSelected(pixels: string[][], sel: Selection): string[][] {
  const out = [...pixels]
  for (let y = sel.y; y < sel.y + sel.height; y++) {
    const row = [...out[y]]
    for (let x = sel.x; x < sel.x + sel.width; x++) if (isSelected(sel, x, y)) row[x] = TRANSPARENT
    out[y] = row
  }
  return out
}

/** Builds a selection from the pixels for which `pick(x, y)` is true, within the given bounds. */
function fromMask(x0: number, y0: number, x1: number, y1: number, pick: (x: number, y: number) => boolean) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!pick(x, y)) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) return null
  const mask = Array.from({ length: maxY - minY + 1 }, (_row, y) =>
    Array.from({ length: maxX - minX + 1 }, (_cell, x) => pick(minX + x, minY + y)),
  )
  const sel: Selection = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  // A full rectangle needs no mask, and then behaves exactly like a rectangular selection
  return mask.every(row => row.every(Boolean)) ? sel : { ...sel, mask }
}

/** The area of the same color as (x, y) that touches it, sides only, like the fill bucket. */
export function magicWandSelection(pixels: string[][], x: number, y: number): Selection | null {
  const height = pixels.length
  const width = pixels[0]?.length ?? 0
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  const target = pixels[y][x]
  const seen = new Uint8Array(width * height)
  const stack = [y * width + x]
  seen[y * width + x] = 1
  while (stack.length) {
    const i = stack.pop()!
    const px = i % width
    const py = (i - px) / width
    for (const [nx, ny] of [
      [px + 1, py],
      [px - 1, py],
      [px, py + 1],
      [px, py - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const n = ny * width + nx
      if (seen[n] || pixels[ny][nx] !== target) continue
      seen[n] = 1
      stack.push(n)
    }
  }
  return fromMask(0, 0, width - 1, height - 1, (px, py) => seen[py * width + px] === 1)
}

/** True when the point is inside the polygon (even-odd rule). */
function insidePolygon(points: { x: number; y: number }[], px: number, py: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * The pixels inside a freehand outline, drawn through the given pixels and closed back to the
 * first one. The pixels the outline goes through are selected too, so a thin stroke still selects.
 */
export function lassoSelection(points: { x: number; y: number }[], width: number, height: number): Selection | null {
  if (points.length === 0) return null
  // The outline as drawn: pointer moves can skip pixels, so consecutive points are joined by lines
  const onPath = new Set<string>()
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length]
    for (const [x, y] of linePoints(p.x, p.y, next.x, next.y)) onPath.add(`${x},${y}`)
  })
  // Polygon through the pixel centers
  const centers = points.map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }))
  const x0 = Math.max(0, Math.min(...points.map(p => p.x)))
  const y0 = Math.max(0, Math.min(...points.map(p => p.y)))
  const x1 = Math.min(width - 1, Math.max(...points.map(p => p.x)))
  const y1 = Math.min(height - 1, Math.max(...points.map(p => p.y)))
  if (x1 < x0 || y1 < y0) return null
  return fromMask(x0, y0, x1, y1, (x, y) => onPath.has(`${x},${y}`) || insidePolygon(centers, x + 0.5, y + 0.5))
}

/** The edges between selected and unselected pixels, in canvas pixels, to draw the outline. */
export function selectionEdges(sel: Selection): [number, number, number, number][] {
  const edges: [number, number, number, number][] = []
  const on = (x: number, y: number) => isSelected(sel, x, y)
  for (let y = sel.y; y < sel.y + sel.height; y++) {
    for (let x = sel.x; x < sel.x + sel.width; x++) {
      if (!on(x, y)) continue
      if (!on(x, y - 1)) edges.push([x, y, x + 1, y])
      if (!on(x, y + 1)) edges.push([x, y + 1, x + 1, y + 1])
      if (!on(x - 1, y)) edges.push([x, y, x, y + 1])
      if (!on(x + 1, y)) edges.push([x + 1, y, x + 1, y + 1])
    }
  }
  return edges
}
