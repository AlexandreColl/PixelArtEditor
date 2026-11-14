import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_MS = 2500

/** A short message at the bottom of the window; a new one replaces the one on screen. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((text: string) => {
    setMessage(text)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), TOAST_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return { toast: message, showToast }
}

export default function Toast({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#323232',
        color: '#fff',
        padding: '10px 24px',
        borderRadius: 8,
        fontSize: 13,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {message}
    </div>
  )
}
