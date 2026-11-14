import { useEffect, useState } from 'react'

export const MAX_CANVAS_SIZE = 256

interface CanvasSizeControlProps {
  width: number
  height: number
  onResize: (width: number, height: number) => void
}

const inputStyle: React.CSSProperties = {
  width: 48,
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#1e1e1e',
  color: '#e0e0e0',
  fontSize: 12,
}

/** A typed size, rounded and kept within 1–256; anything unreadable keeps the current size. */
function parseSize(value: string, fallback: number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_CANVAS_SIZE, n) : fallback
}

export default function CanvasSizeControl({ width, height, onResize }: CanvasSizeControlProps) {
  const [w, setW] = useState(String(width))
  const [h, setH] = useState(String(height))

  // Follow the canvas when its size changes elsewhere (open, new, undo of a resize...)
  useEffect(() => {
    setW(String(width))
    setH(String(height))
  }, [width, height])

  const apply = () => {
    const newW = parseSize(w, width)
    const newH = parseSize(h, height)
    setW(String(newW))
    setH(String(newH))
    onResize(newW, newH)
  }

  return (
    <>
      <label style={{ fontSize: 12, color: '#aaa' }}>W:</label>
      <input
        type="number"
        value={w}
        min={1}
        max={MAX_CANVAS_SIZE}
        onChange={e => setW(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && apply()}
        style={inputStyle}
      />
      <label style={{ fontSize: 12, color: '#aaa' }}>H:</label>
      <input
        type="number"
        value={h}
        min={1}
        max={MAX_CANVAS_SIZE}
        onChange={e => setH(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && apply()}
        style={inputStyle}
      />
      <button
        onClick={apply}
        style={{
          padding: '2px 10px',
          borderRadius: 4,
          border: '1px solid #4fc3f7',
          background: 'transparent',
          color: '#4fc3f7',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        Resize
      </button>
    </>
  )
}
