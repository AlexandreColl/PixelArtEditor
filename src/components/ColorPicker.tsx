import { useEffect, useRef, useState } from 'react'
import { type HSV, hsvToRgb, parseColor, parseHexInput, rgbToHsv, toHex } from '../utils/color'

interface ColorPickerProps {
  /** Opaque #rrggbb */
  color: string
  onChange: (color: string) => void
}

const SV_HEIGHT = 110
const HUE_HEIGHT = 12

const hsvToHex = ([h, s, v]: HSV) => toHex([...hsvToRgb(h, s, v), 255])

function hexToHsv(color: string): HSV {
  const [r, g, b] = parseColor(color) ?? [0, 0, 0, 255]
  return rgbToHsv(r, g, b)
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Fraction (0–1) of the pointer position across an element, on both axes. */
function pointerFraction(e: React.PointerEvent, el: HTMLElement): [number, number] {
  const rect = el.getBoundingClientRect()
  return [clamp01((e.clientX - rect.left) / rect.width), clamp01((e.clientY - rect.top) / rect.height)]
}

/** Calls onDrag on pointer down and on every move while the button is held, even outside the element. */
function useDrag(onDrag: (e: React.PointerEvent, el: HTMLElement) => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      onDrag(e, e.currentTarget)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) onDrag(e, e.currentTarget)
    },
  }
}

const marker: React.CSSProperties = {
  position: 'absolute',
  boxSizing: 'border-box',
  border: '2px solid #fff',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
  pointerEvents: 'none',
}

/** Saturation/value square, hue bar and hex field for the primary color. */
export default function ColorPicker({ color, onChange }: ColorPickerProps) {
  // Kept apart from `color` so the hue survives grays and black, where the hex color has none
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color))
  const [hexText, setHexText] = useState(color)
  const [hexInvalid, setHexInvalid] = useState(false)
  const lastSent = useRef(color)

  // Follow changes made elsewhere (swatches, eyedropper, swap, palette lock)
  useEffect(() => {
    setHexText(color)
    setHexInvalid(false)
    if (color !== lastSent.current) {
      lastSent.current = color
      setHsv(hexToHsv(color))
    }
  }, [color])

  const update = (next: HSV) => {
    setHsv(next)
    const hex = hsvToHex(next)
    lastSent.current = hex
    if (hex !== color) onChange(hex)
  }

  const svDrag = useDrag((e, el) => {
    const [x, y] = pointerFraction(e, el)
    update([hsv[0], x, 1 - y])
  })
  const hueDrag = useDrag((e, el) => {
    const [x] = pointerFraction(e, el)
    update([Math.min(359.9, x * 360), hsv[1], hsv[2]])
  })

  const commitHex = () => {
    const parsed = parseHexInput(hexText)
    if (!parsed) {
      setHexInvalid(true)
      return
    }
    setHexInvalid(false)
    setHexText(parsed)
    if (parsed !== color) {
      lastSent.current = parsed
      setHsv(hexToHsv(parsed))
      onChange(parsed)
    }
  }

  const [h, s, v] = hsv
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        {...svDrag}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(s * 100)}%, brightness ${Math.round(v * 100)}%`}
        style={{
          position: 'relative',
          height: SV_HEIGHT,
          borderRadius: 4,
          cursor: 'crosshair',
          touchAction: 'none',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`,
        }}
      >
        <div
          style={{
            ...marker,
            width: 12,
            height: 12,
            borderRadius: '50%',
            left: `calc(${s * 100}% - 6px)`,
            top: `calc(${(1 - v) * 100}% - 6px)`,
            background: hsvToHex(hsv),
          }}
        />
      </div>

      <div
        {...hueDrag}
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(h)}
        style={{
          position: 'relative',
          height: HUE_HEIGHT,
          borderRadius: HUE_HEIGHT / 2,
          cursor: 'pointer',
          touchAction: 'none',
          background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
      >
        <div
          style={{
            ...marker,
            width: 8,
            height: HUE_HEIGHT + 4,
            top: -2,
            borderRadius: 3,
            left: `calc(${(h / 360) * 100}% - 4px)`,
          }}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#aaa' }}>
        Hex
        <input
          value={hexText}
          spellCheck={false}
          maxLength={7}
          onChange={e => setHexText(e.target.value)}
          onBlur={commitHex}
          onKeyDown={e => {
            if (e.key === 'Enter') commitHex()
            if (e.key === 'Escape') {
              setHexText(color)
              setHexInvalid(false)
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '3px 6px',
            borderRadius: 4,
            border: `1px solid ${hexInvalid ? '#d32f2f' : '#555'}`,
            background: '#1e1e1e',
            color: '#e0e0e0',
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: 12,
          }}
        />
      </label>
    </div>
  )
}
