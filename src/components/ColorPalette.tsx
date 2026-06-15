import { useState } from 'react'

interface ColorPaletteProps {
  primaryColor: string
  secondaryColor: string
  onPrimaryChange: (color: string) => void
  onSecondaryChange: (color: string) => void
}

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#ff00ff', '#00ffff', '#808080', '#800000',
  '#008000', '#000080', '#808000', '#800080', '#008080',
  '#c0c0c0', '#ff8800', '#88ff00', '#0088ff', '#ff0088',
]

export default function ColorPalette({
  primaryColor,
  secondaryColor,
  onPrimaryChange,
  onSecondaryChange,
}: ColorPaletteProps) {
  const [showPicker, setShowPicker] = useState(false)

  const handleColorClick = (color: string, button: number) => {
    if (button === 2) {
      onSecondaryChange(color)
    } else {
      onPrimaryChange(color)
    }
  }

  return (
    <div
      style={{
        width: 200,
        background: '#2d2d2d',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderLeft: '1px solid #444',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div
          title="Left click to copy"
          style={{
            width: 32,
            height: 32,
            background: primaryColor,
            border: '2px solid #fff',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          onClick={() => setShowPicker(!showPicker)}
        />
        <div
          title="Right click to copy"
          style={{
            width: 20,
            height: 20,
            background: secondaryColor,
            border: '2px solid #999',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          onClick={() => onSecondaryChange(primaryColor)}
        />
        <span style={{ color: '#aaa', fontSize: 11 }}>Swap</span>
      </div>

      {showPicker && (
        <input
          type="color"
          value={primaryColor}
          onChange={e => onPrimaryChange(e.target.value)}
          style={{ width: '100%', height: 40, border: 'none', padding: 0, cursor: 'pointer' }}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 4,
        }}
      >
        {PRESET_COLORS.map(color => (
          <div
            key={color}
            title={`${color} (left: primary, right: secondary)`}
            style={{
              width: '100%',
              aspectRatio: '1',
              background: color,
              border: primaryColor === color
                ? '2px solid #4fc3f7'
                : secondaryColor === color
                  ? '2px solid #999'
                  : '2px solid transparent',
              borderRadius: 3,
              cursor: 'pointer',
            }}
            onClick={() => handleColorClick(color, 0)}
            onContextMenu={e => {
              e.preventDefault()
              handleColorClick(color, 2)
            }}
          />
        ))}
      </div>
    </div>
  )
}
