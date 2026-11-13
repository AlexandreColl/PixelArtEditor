import { useEffect, useState } from 'react'

/** Delay before showing a tooltip, so it does not flash while the pointer crosses the toolbar. */
const SHOW_DELAY_MS = 350
const GAP = 8
const MAX_WIDTH = 260

/**
 * Props for an element with a tooltip: the label (which can span several lines) and an optional shortcut.
 * The label is also the accessible name, so icon-only buttons are announced by screen readers.
 */
export function tip(label: string, shortcut?: string) {
  return {
    'aria-label': label.split('\n')[0],
    'data-tooltip': label,
    ...(shortcut ? { 'data-shortcut': shortcut } : {}),
  }
}

interface Shown {
  label: string
  shortcut: string | null
  anchor: DOMRect
}

/**
 * Shows the tooltip of whatever element marked with tip() is under the pointer. One listener for the whole app,
 * so components only add attributes. It goes to the right of tall narrow targets (the toolbar) and below the rest.
 */
export default function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let current: HTMLElement | null = null

    const hide = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      current = null
      setShown(null)
    }

    const onOver = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest<HTMLElement>('[data-tooltip]') ?? null
      if (target === current) return
      hide()
      if (!target) return
      current = target
      timer = setTimeout(() => {
        setShown({
          label: target.dataset.tooltip ?? '',
          shortcut: target.dataset.shortcut ?? null,
          anchor: target.getBoundingClientRect(),
        })
      }, SHOW_DELAY_MS)
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  if (!shown) return null
  const { anchor } = shown
  const toTheRight = anchor.left < 120
  const center = anchor.left + anchor.width / 2
  // Below the target: centred, or aligned to it near the window edges so it never goes off screen
  const style: React.CSSProperties = toTheRight
    ? { left: anchor.right + GAP, top: anchor.top + anchor.height / 2, transform: 'translateY(-50%)' }
    : center > window.innerWidth - MAX_WIDTH / 2
      ? { right: Math.max(GAP, window.innerWidth - anchor.right), top: anchor.bottom + GAP }
      : center < MAX_WIDTH / 2
        ? { left: Math.max(GAP, anchor.left), top: anchor.bottom + GAP }
        : { left: center, top: anchor.bottom + GAP, transform: 'translateX(-50%)' }

  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        zIndex: 10000,
        maxWidth: MAX_WIDTH,
        padding: '5px 8px',
        borderRadius: 4,
        background: '#111',
        border: '1px solid #444',
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
        color: '#e0e0e0',
        fontSize: 12,
        lineHeight: 1.4,
        whiteSpace: 'pre-line',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {shown.label}
      {shown.shortcut && (
        <span
          style={{
            marginLeft: 8,
            padding: '0 4px',
            borderRadius: 3,
            border: '1px solid #555',
            color: '#aaa',
            fontSize: 11,
          }}
        >
          {shown.shortcut}
        </span>
      )}
    </div>
  )
}
