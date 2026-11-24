// How long each frame of the animation shows. A frame either has its own duration, in
// milliseconds, or null to follow the animation's speed (fps), which is what new frames do.

export type FrameDuration = number | null

export const MIN_DURATION = 10
export const MAX_DURATION = 10000

/** A duration typed or read from a file: whole milliseconds within limits, or null when it is not one. */
export function cleanDuration(value: unknown): FrameDuration {
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value)
  if (value === null || !Number.isFinite(n) || n <= 0) return null
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(n)))
}

/** How long frame `i` shows, in milliseconds. */
export function frameDuration(durations: readonly FrameDuration[], i: number, fps: number): number {
  return durations[i] ?? 1000 / fps
}

/** The duration of every one of `count` frames, in milliseconds. */
export function frameDurations(count: number, fps: number, durations: readonly FrameDuration[] = []): number[] {
  return Array.from({ length: count }, (_, i) => frameDuration(durations, i, fps))
}

/** Exactly `count` durations, from a file that may have fewer, more or unreadable ones. */
export function normalizeDurations(raw: unknown, count: number): FrameDuration[] {
  const list = Array.isArray(raw) ? raw : []
  return Array.from({ length: count }, (_, i) => cleanDuration(list[i]))
}

/** True when some frame has its own duration, so files only record durations when there are any. */
export function hasCustomDurations(durations: readonly FrameDuration[]): boolean {
  return durations.some(d => d !== null)
}
