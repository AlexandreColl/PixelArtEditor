import type { ShapeTool } from '../types'

export type Point = [number, number]

/** Bresenham line between two pixels, both ends included. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    points.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return points
}

/** Rectangle with the two given pixels as opposite corners. */
export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const points: Point[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) points.push([x, y])
    }
  }
  return points
}

/**
 * Ellipse inscribed in the bounding box of the two given pixels.
 * A pixel belongs to it when its centre is inside; the outline is the pixels with a 4-neighbour outside.
 */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const a = (maxX - minX + 1) / 2
  const b = (maxY - minY + 1) / 2
  const cx = minX + a
  const cy = minY + b
  const inside = (x: number, y: number) => {
    const dx = (x + 0.5 - cx) / a
    const dy = (y + 0.5 - cy) / b
    return dx * dx + dy * dy <= 1
  }
  const points: Point[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!inside(x, y)) continue
      if (filled || !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) {
        points.push([x, y])
      }
    }
  }
  return points
}

export function shapePoints(
  shape: ShapeTool,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): Point[] {
  if (shape === 'line') return linePoints(x0, y0, x1, y1)
  if (shape === 'rect') return rectPoints(x0, y0, x1, y1, filled)
  return ellipsePoints(x0, y0, x1, y1, filled)
}
