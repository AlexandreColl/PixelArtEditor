import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { PixelData } from '../types'
import { MAX_FPS } from '../hooks/useEditor'
import { FrameImage, TIMELINE_HEIGHT } from './Timeline'
import { tip } from './Tooltip'
import Button from './Button'

interface AnimationPreviewProps {
  frames: PixelData[]
  currentFrame: number
  fps: number
  onFpsChange: (fps: number) => void
  playing: boolean
  onTogglePlay: () => void
}

const BOX = TIMELINE_HEIGHT - 12

/**
 * The animation playing in a small box, at its real size or enlarged to fill the box.
 * Stopped, it shows the frame being edited. Drawing while it plays shows up straight away.
 */
export default function AnimationPreview({
  frames,
  currentFrame,
  fps,
  onFpsChange,
  playing,
  onTogglePlay,
}: AnimationPreviewProps) {
  const [tick, setTick] = useState(0)
  const [realSize, setRealSize] = useState(false)
  const [fpsText, setFpsText] = useState(String(fps))

  // Follow the speed when it changes elsewhere (open, undo...)
  const [shownFps, setShownFps] = useState(fps)
  if (fps !== shownFps) {
    setShownFps(fps)
    setFpsText(String(fps))
  }

  // Each start, or change of speed while playing, counts again from the frame being edited
  const [run, setRun] = useState({ playing, fps })
  if (run.playing !== playing || run.fps !== fps) {
    setRun({ playing, fps })
    if (playing) setTick(0)
  }

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setTick(t => t + 1), 1000 / fps)
    return () => window.clearInterval(id)
  }, [playing, fps])

  // Starts from the frame being edited, so a long animation plays from where you are
  const shown = playing ? (currentFrame + tick) % frames.length : currentFrame
  const frame = frames[Math.min(shown, frames.length - 1)]

  const commitFps = () => {
    const n = Number(fpsText)
    if (Number.isFinite(n) && n > 0) onFpsChange(n)
    else setFpsText(String(fps))
  }

  return (
    <>
      <button
        {...tip(realSize ? 'Preview at real size. Click: fill the box' : 'Preview enlarged. Click: real size')}
        onClick={() => setRealSize(r => !r)}
        style={{
          width: BOX,
          height: BOX,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: 0,
          borderRadius: 4,
          border: '1px solid var(--divider)',
          background: 'var(--bg)',
          cursor: 'pointer',
        }}
      >
        <FrameImage frame={frame} box={realSize ? Math.max(frame.width, frame.height) : BOX - 4} />
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <Button
          icon
          {...tip(playing ? 'Stop' : 'Play the animation', 'P')}
          aria-pressed={playing}
          onClick={onTogglePlay}
          disabled={frames.length < 2}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <label
          {...tip('Speed in frames per second')}
          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-subtle)' }}
        >
          <input
            type="number"
            min={1}
            max={MAX_FPS}
            value={fpsText}
            onChange={e => {
              setFpsText(e.target.value)
              // The spinner arrows change the speed straight away; typed values too once they are valid
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n >= 1 && n <= MAX_FPS) onFpsChange(n)
            }}
            onBlur={commitFps}
            onKeyDown={e => {
              if (e.key === 'Enter') commitFps()
            }}
            style={{
              width: 36,
              padding: '1px 3px',
              borderRadius: 3,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 11,
            }}
          />
          fps
        </label>
      </div>

      <div style={{ width: 1, alignSelf: 'stretch', margin: '8px 0', background: 'var(--divider)' }} />
    </>
  )
}
