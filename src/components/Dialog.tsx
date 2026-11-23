import { useEffect } from 'react'
import { useLatest } from '../hooks/useLatest'
import Button from './Button'

export const fieldStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13,
}

export const labelText: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)' }

interface DialogProps {
  title: string
  subtitle?: string
  /** Escape and the Cancel button */
  onCancel: () => void
  /** Enter and the main button; disabled when null */
  onConfirm: (() => void) | null
  confirmLabel: string
  cancelLabel?: string
  /** False when cancelling loses something, so a stray Escape can't do it */
  cancelOnEscape?: boolean
  width?: number
  children: React.ReactNode
}

/** A modal window over the editor. While it is open the editor shortcuts are off (see useKeyboardShortcuts). */
export default function Dialog({
  title,
  subtitle,
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel = 'Cancel',
  cancelOnEscape = true,
  width = 480,
  children,
}: DialogProps) {
  const actions = useLatest({ onCancel, onConfirm, cancelOnEscape })

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (actions.current.cancelOnEscape) actions.current.onCancel()
      }
      // Not from buttons, so Enter on a focused Cancel still cancels
      else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') actions.current.onConfirm?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [actions])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--divider)',
          borderRadius: 10,
          padding: 20,
          width: `min(${width}px, calc(100vw - 32px))`,
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: 'var(--text)',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 }}>{subtitle}</div>}
        </div>

        {children}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>{cancelLabel}</Button>
          <Button variant="primary" onClick={() => onConfirm?.()} disabled={!onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
