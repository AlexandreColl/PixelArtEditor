import type { Selection } from '../types'

/**
 * The squares a size x size brush centred on (cx, cy) covers, clipped to the canvas. With mirrorX / mirrorY the
 * square is also reflected across the canvas centre; the reflection is computed from its edges so even sizes
 * stay symmetric. Squares that fall fully outside the canvas are left out.
 */
export function brushFootprints(
  cx: number,
  cy: number,
  size: number,
  width: number,
  height: number,
  mirrorX = false,
  mirrorY = false,
): Selection[] {
  const off = Math.floor((size - 1) / 2)
  const x0 = cx - off
  const y0 = cy - off
  const xs: [number, number][] = [[x0, x0 + size - 1]]
  const ys: [number, number][] = [[y0, y0 + size - 1]]
  if (mirrorX) xs.push([width - 1 - (x0 + size - 1), width - 1 - x0])
  if (mirrorY) ys.push([height - 1 - (y0 + size - 1), height - 1 - y0])

  const squares: Selection[] = []
  const seen = new Set<string>()
  for (const [ax, bx] of xs) {
    for (const [ay, by] of ys) {
      const left = Math.max(0, ax)
      const top = Math.max(0, ay)
      const right = Math.min(width - 1, bx)
      const bottom = Math.min(height - 1, by)
      if (right < left || bottom < top) continue
      // A brush on the axis is its own reflection
      const key = `${left},${top},${right},${bottom}`
      if (seen.has(key)) continue
      seen.add(key)
      squares.push({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 })
    }
  }
  return squares
}
