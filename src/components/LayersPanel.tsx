import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Merge, Plus, Trash2 } from 'lucide-react'
import type { Layer } from '../types'
import Button from './Button'
import { tip } from './Tooltip'

interface LayersPanelProps {
  layers: Layer[]
  currentLayer: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (from: number, to: number) => void
  onMergeDown: () => void
  /** With commit false the change is shown but not yet an undo step (while dragging the opacity slider) */
  onUpdate: (index: number, changes: Partial<Omit<Layer, 'id'>>, commit?: boolean) => void
  /** Records the opacity dragged so far as one undo step */
  onCommit: () => void
}

/** The layer stack, top layer first as it is drawn in front, with the settings of the current one. */
export default function LayersPanel({
  layers,
  currentLayer,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onMergeDown,
  onUpdate,
  onCommit,
}: LayersPanelProps) {
  const [renaming, setRenaming] = useState<number | null>(null)
  const current = layers[currentLayer]
  const top = layers.length - 1

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderLeft: '1px solid var(--divider)',
        borderTop: '1px solid var(--divider)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>Layers</span>
        <Button icon size="sm" {...tip('New layer')} onClick={onAdd}>
          <Plus size={13} />
        </Button>
        <Button icon size="sm" {...tip('Duplicate layer')} onClick={onDuplicate}>
          <Copy size={13} />
        </Button>
        <Button
          icon
          size="sm"
          {...tip(currentLayer > 0 ? 'Merge down into the layer below' : 'The bottom layer has nothing to merge into')}
          onClick={onMergeDown}
          disabled={currentLayer === 0}
        >
          <Merge size={13} />
        </Button>
        <Button
          icon
          size="sm"
          {...tip(layers.length > 1 ? 'Delete layer' : 'The only layer cannot be deleted')}
          onClick={onDelete}
          disabled={layers.length <= 1}
        >
          <Trash2 size={13} />
        </Button>
      </div>

      <div
        role="listbox"
        aria-label="Layers"
        style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto' }}
      >
        {/* Top layer first: the list reads like the stack seen from the front */}
        {layers
          .map((layer, i) => ({ layer, i }))
          .reverse()
          .map(({ layer, i }) => (
            <div
              key={layer.id}
              role="option"
              aria-selected={i === currentLayer}
              onClick={() => onSelect(i)}
              onDoubleClick={() => setRenaming(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 4px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                background: i === currentLayer ? 'var(--accent-bg)' : 'transparent',
                border: i === currentLayer ? '1px solid var(--accent)' : '1px solid transparent',
                color: layer.visible ? 'var(--text)' : '#777',
              }}
            >
              <Button
                variant="ghost"
                icon
                size="xs"
                {...tip(layer.visible ? 'Hide layer' : 'Show layer')}
                aria-pressed={layer.visible}
                onClick={e => {
                  e.stopPropagation()
                  onUpdate(i, { visible: !layer.visible })
                }}
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </Button>
              {renaming === i ? (
                <input
                  autoFocus
                  defaultValue={layer.name}
                  aria-label="Layer name"
                  onClick={e => e.stopPropagation()}
                  onBlur={e => {
                    const name = e.target.value.trim()
                    if (name && name !== layer.name) onUpdate(i, { name })
                    setRenaming(null)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '1px 4px',
                    borderRadius: 3,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 12,
                  }}
                />
              ) : (
                <span
                  {...tip(`${layer.name}\nDouble-click to rename`)}
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {layer.name}
                </span>
              )}
              {layer.opacity < 1 && (
                <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{Math.round(layer.opacity * 100)}%</span>
              )}
            </div>
          ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label
          {...tip('Opacity of the current layer')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(current.opacity * 100)}
            onChange={e => onUpdate(currentLayer, { opacity: Number(e.target.value) / 100 }, false)}
            onPointerUp={onCommit}
            onKeyUp={onCommit}
            style={{ flex: 1, minWidth: 0 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-subtle)', width: 30, textAlign: 'right' }}>
            {Math.round(current.opacity * 100)}%
          </span>
        </label>
        <Button
          icon
          size="sm"
          {...tip('Move layer up')}
          onClick={() => onMove(currentLayer, currentLayer + 1)}
          disabled={currentLayer === top}
        >
          <ArrowUp size={13} />
        </Button>
        <Button
          icon
          size="sm"
          {...tip('Move layer down')}
          onClick={() => onMove(currentLayer, currentLayer - 1)}
          disabled={currentLayer === 0}
        >
          <ArrowDown size={13} />
        </Button>
      </div>
    </div>
  )
}
