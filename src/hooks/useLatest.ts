import { useLayoutEffect, useRef } from 'react'

/**
 * A ref that always holds the latest committed `value`, for event handlers and long-lived
 * listeners that must see current props without being registered again on every render.
 * It is updated after the render is committed, so a render React throws away never leaks into it.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}
