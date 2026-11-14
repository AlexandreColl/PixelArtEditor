import { useEffect, useRef } from 'react'

export const dialogButton: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid #555',
  background: 'transparent',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: 13,
}

export const primaryButton: React.CSSProperties = {
  ...dialogButton,
  border: '1px solid #4fc3f7',
  background: '#1a3a4a',
  color: '#4fc3f7',
  fontWeight: 600,
}

export const fieldStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid #555',
  background: '#1e1e1e',
  color: '#e0e0e0',
  fontSize: 13,
}

export const labelText: React.CSSProperties = { fontSize: 12, color: '#aaa' }

interface DialogProps {
  title: string
  subtitle?: string
  /** Escape and the Cancel button */
  onCancel: () => void
  /** Enter and the main button; disabled when null */
  onConfirm: (() => void) | null
  confirmLabel: string
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
  width = 480,
  children,
}: DialogProps) {
  const actions = useRef({ onCancel, onConfirm })
  actions.current = { onCancel, onConfirm }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actions.current.onCancel()
      // Not from buttons, so Enter on a focused Cancel still cancels
      else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') actions.current.onConfirm?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

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
          background: '#2d2d2d',
          border: '1px solid #444',
          borderRadius: 10,
          padding: 20,
          width: `min(${width}px, calc(100vw - 32px))`,
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: '#e0e0e0',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{subtitle}</div>}
        </div>

        {children}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={dialogButton}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm?.()}
            disabled={!onConfirm}
            style={{ ...primaryButton, opacity: onConfirm ? 1 : 0.4, cursor: onConfirm ? 'pointer' : 'default' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
