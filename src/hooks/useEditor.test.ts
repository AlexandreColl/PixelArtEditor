// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEditor } from './useEditor'
import { TRANSPARENT } from '../utils/color'
import { paletteSnapper } from '../utils/palette'

const RED = '#ff0000'
const BLUE = '#0000ff'

function setup() {
  const { result } = renderHook(() => useEditor())
  /** Runs editor calls as one batch, like a single pointer or keyboard event. */
  const run = (fn: (editor: ReturnType<typeof useEditor>) => void) => act(() => fn(result.current))
  const pixel = (x: number, y: number) => result.current.state.pixelData.pixels[y][x]
  const painted = () =>
    result.current.state.pixelData.pixels.flatMap((row, y) =>
      row.flatMap((c, x) => (c === TRANSPARENT ? [] : [`${x},${y}`])),
    )
  /** One committed stroke of a single pixel. */
  const dot = (x: number, y: number, color: string) =>
    run(e => {
      e.paintLine(x, y, x, y, color, 1)
      e.commitHistory()
    })
  return { result, run, pixel, painted, dot }
}

describe('useEditor history', () => {
  it('starts with an empty 32x32 canvas and nothing to undo', () => {
    const { result, painted } = setup()
    expect(result.current.state.pixelData).toMatchObject({ width: 32, height: 32 })
    expect(painted()).toEqual([])
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('undoes and redoes a stroke', () => {
    const { result, run, pixel, dot } = setup()
    dot(3, 4, RED)
    expect(pixel(3, 4)).toBe(RED)
    expect(result.current.canUndo).toBe(true)

    run(e => e.undo())
    expect(pixel(3, 4)).toBe(TRANSPARENT)
    expect(result.current.canRedo).toBe(true)

    run(e => e.redo())
    expect(pixel(3, 4)).toBe(RED)
  })

  it('records a whole stroke, however many segments, as one step', () => {
    const { run, painted } = setup()
    run(e => {
      e.paintLine(0, 0, 3, 0, RED, 1)
      e.paintLine(3, 0, 3, 3, RED, 1)
      e.commitHistory()
    })
    expect(painted()).toHaveLength(7)
    run(e => e.undo())
    expect(painted()).toEqual([])
  })

  it('does not record a step when nothing changed', () => {
    const { result, run } = setup()
    run(e => e.commitHistory())
    expect(result.current.canUndo).toBe(false)
  })

  it('drops the redo branch after a new edit', () => {
    const { result, run, pixel, dot } = setup()
    dot(0, 0, RED)
    run(e => e.undo())
    dot(1, 1, BLUE)
    expect(result.current.canRedo).toBe(false)
    expect(pixel(0, 0)).toBe(TRANSPARENT)
  })

  it('starts a fresh history on import', () => {
    const { result, run, dot } = setup()
    dot(0, 0, RED)
    run(e => e.importPixels([[BLUE, RED]], 2, 1))
    expect(result.current.state.pixelData).toEqual({ width: 2, height: 1, pixels: [[BLUE, RED]] })
    expect(result.current.canUndo).toBe(false)
  })
})

describe('useEditor drawing', () => {
  it('stamps a square brush centred on the point', () => {
    const { run, painted } = setup()
    run(e => e.paintLine(5, 5, 5, 5, RED, 3))
    expect(painted().sort()).toEqual(['4,4', '4,5', '4,6', '5,4', '5,5', '5,6', '6,4', '6,5', '6,6'])
  })

  it('keeps an even brush symmetric when mirroring on both axes', () => {
    const { result, run, pixel } = setup()
    run(e => {
      e.toggleMirrorX()
      e.toggleMirrorY()
    })
    run(e => e.paintLine(2, 3, 6, 9, RED, 2))
    const { width, height } = result.current.state.pixelData
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(pixel(width - 1 - x, y)).toBe(pixel(x, y))
        expect(pixel(x, height - 1 - y)).toBe(pixel(x, y))
      }
    }
    expect(pixel(2, 3)).toBe(RED)
  })

  it('redraws a shape preview from the canvas as it was when the drag started', () => {
    const { result, run, pixel } = setup()
    run(e => {
      e.beginShape()
      e.drawShape('rect', 0, 0, 9, 9, RED, 1, false)
      e.drawShape('rect', 0, 0, 3, 3, RED, 1, false)
      e.commitHistory()
    })
    expect(pixel(9, 9)).toBe(TRANSPARENT)
    expect(pixel(3, 3)).toBe(RED)
    run(e => e.undo())
    expect(pixel(3, 3)).toBe(TRANSPARENT)
    expect(result.current.canUndo).toBe(false)
  })

  it('fills only the connected area of the same color', () => {
    const { run, pixel } = setup()
    // A closed box splits the canvas into inside and outside
    run(e => {
      e.beginShape()
      e.drawShape('rect', 2, 2, 6, 6, RED, 1, false)
      e.commitHistory()
    })
    run(e => e.fillRegion(4, 4, BLUE))
    expect(pixel(4, 4)).toBe(BLUE)
    expect(pixel(3, 3)).toBe(BLUE)
    expect(pixel(2, 2)).toBe(RED)
    expect(pixel(0, 0)).toBe(TRANSPARENT)
  })

  it('ignores a fill with the color already there', () => {
    const { result, run } = setup()
    run(e => e.fillRegion(0, 0, TRANSPARENT))
    expect(result.current.canUndo).toBe(false)
  })

  it('shades a pixel to the alpha-weighted average of its neighbours', () => {
    const { run, pixel } = setup()
    run(e => {
      e.importPixels(
        [
          [RED, RED, RED],
          [RED, BLUE, RED],
          [RED, RED, RED],
        ],
        3,
        3,
      )
    })
    run(e => e.shadePixel(1, 1))
    // 8 red and 1 blue: r = round(255 * 8/9) = 227, b = round(255 * 1/9) = 28
    expect(pixel(1, 1)).toBe('#e3001c')
  })

  it('maps the shading blend to a palette color when given a snapper', () => {
    const { run, pixel } = setup()
    run(e =>
      e.importPixels(
        [
          [RED, RED, RED],
          [RED, BLUE, RED],
          [RED, RED, RED],
        ],
        3,
        3,
      ),
    )
    run(e => e.shadePixel(1, 1, paletteSnapper([RED, BLUE])))
    expect(pixel(1, 1)).toBe(RED)
  })

  it('picks opaque colors as hex and transparent ones as null', () => {
    const { result, dot } = setup()
    dot(1, 1, 'rgba(255,0,0,0.5)')
    expect(result.current.pickColor(1, 1)).toBe(RED)
    expect(result.current.pickColor(0, 0)).toBeNull()
  })
})

describe('useEditor canvas', () => {
  it('keeps the existing pixels when resizing and undoes the resize', () => {
    const { result, run, pixel, dot } = setup()
    dot(1, 1, RED)
    run(e => e.resizeCanvas(4, 3))
    expect(result.current.state.pixelData).toMatchObject({ width: 4, height: 3 })
    expect(pixel(1, 1)).toBe(RED)
    run(e => e.undo())
    expect(result.current.state.pixelData).toMatchObject({ width: 32, height: 32 })
  })

  it('applies AI pixels at an offset, skipping invalid colors and anything outside the canvas', () => {
    const { result, run, pixel, dot } = setup()
    dot(31, 30, BLUE)
    let applied = 0
    run(e => {
      applied = e.applyPixels(
        [
          ['#F00', 'not a color'],
          ['rgb(0,0,255)', '#00ff00'],
        ],
        31,
        30,
        2,
        2,
      )
    })
    expect(applied).toBe(2)
    expect(pixel(31, 30)).toBe(RED)
    expect(pixel(31, 31)).toBe(BLUE)
    expect(result.current.canUndo).toBe(true)
  })
})

describe('useEditor remapColors', () => {
  it('maps the whole canvas as one undo step', () => {
    const { result, run, pixel, dot } = setup()
    dot(0, 0, '#e01010')
    dot(1, 0, '#1010e0')
    let changed = 0
    run(e => {
      changed = e.remapColors(paletteSnapper([RED, BLUE]))
    })
    expect(changed).toBe(2)
    expect([pixel(0, 0), pixel(1, 0)]).toEqual([RED, BLUE])
    run(e => e.undo())
    expect(pixel(0, 0)).toBe('#e01010')
    expect(result.current.canRedo).toBe(true)
  })

  it('only maps the selection when there is one', () => {
    const { run, pixel, dot } = setup()
    dot(0, 0, '#e01010')
    dot(5, 5, '#e01010')
    run(e => e.setSelection({ x: 0, y: 0, width: 2, height: 2 }))
    run(e => e.remapColors(paletteSnapper([RED])))
    expect(pixel(0, 0)).toBe(RED)
    expect(pixel(5, 5)).toBe('#e01010')
  })

  it('records nothing when no pixel changes', () => {
    const { result, run, dot } = setup()
    dot(0, 0, RED)
    let changed = -1
    run(e => {
      changed = e.remapColors(paletteSnapper([RED]))
    })
    expect(changed).toBe(0)
    run(e => e.undo())
    expect(result.current.canUndo).toBe(false)
  })
})

describe('useEditor selection', () => {
  it('nudges the selected pixels and undo brings back both the pixels and the selection', () => {
    const { result, run, pixel, dot } = setup()
    dot(2, 2, RED)
    run(e => e.setSelection({ x: 2, y: 2, width: 2, height: 2 }))
    run(e => e.nudgeSelection(1, 0))
    expect(pixel(2, 2)).toBe(TRANSPARENT)
    expect(pixel(3, 2)).toBe(RED)
    expect(result.current.state.selection).toEqual({ x: 3, y: 2, width: 2, height: 2 })

    run(e => e.undo())
    expect(pixel(2, 2)).toBe(RED)
    expect(result.current.state.selection).toEqual({ x: 2, y: 2, width: 2, height: 2 })
  })

  it('keeps a moved selection inside the canvas', () => {
    const { result, run } = setup()
    run(e => e.setSelection({ x: 0, y: 0, width: 4, height: 4 }))
    run(e => {
      e.beginMove(false)
      e.moveSelectionTo(100, -5)
      e.commitHistory()
    })
    expect(result.current.state.selection).toEqual({ x: 28, y: 0, width: 4, height: 4 })
  })

  it('leaves what is below a moved selection where its own pixels are transparent', () => {
    const { run, pixel, dot } = setup()
    dot(0, 0, RED)
    dot(5, 5, BLUE)
    run(e => e.setSelection({ x: 0, y: 0, width: 2, height: 2 }))
    run(e => {
      e.beginMove(false)
      e.moveSelectionTo(4, 4)
      e.commitHistory()
    })
    expect(pixel(0, 0)).toBe(TRANSPARENT)
    expect(pixel(4, 4)).toBe(RED)
    expect(pixel(5, 5)).toBe(BLUE)
  })

  it('leaves the original in place when moving a copy', () => {
    const { run, pixel, dot } = setup()
    dot(0, 0, RED)
    run(e => e.setSelection({ x: 0, y: 0, width: 1, height: 1 }))
    run(e => {
      e.beginMove(true)
      e.moveSelectionTo(3, 0)
      e.commitHistory()
    })
    expect(pixel(0, 0)).toBe(RED)
    expect(pixel(3, 0)).toBe(RED)
  })

  it('cuts and pastes, keeping the pasted area inside the canvas and selected', () => {
    const { result, run, pixel, dot } = setup()
    dot(0, 0, RED)
    run(e => e.setSelection({ x: 0, y: 0, width: 2, height: 2 }))
    let ok = false
    run(e => {
      ok = e.cutSelection()
    })
    expect(ok).toBe(true)
    expect(pixel(0, 0)).toBe(TRANSPARENT)
    expect(result.current.hasClipboard).toBe(true)

    run(e => e.pasteClipboard(31, 31))
    expect(pixel(30, 30)).toBe(RED)
    expect(result.current.state.selection).toEqual({ x: 30, y: 30, width: 2, height: 2 })

    // The paste is one step; undoing it goes back to the canvas after the cut
    run(e => e.undo())
    expect(pixel(30, 30)).toBe(TRANSPARENT)
  })

  it('reports nothing to do without a selection or clipboard', () => {
    const { result } = setup()
    expect(result.current.copySelection()).toBe(false)
    expect(result.current.nudgeSelection(1, 0)).toBe(false)
    expect(result.current.pasteClipboard(0, 0)).toBe(false)
  })

  it('clears the selection when the canvas size changes', () => {
    const { result, run } = setup()
    run(e => e.selectAll())
    expect(result.current.state.selection).toEqual({ x: 0, y: 0, width: 32, height: 32 })
    run(e => e.resizeCanvas(16, 16))
    expect(result.current.state.selection).toBeNull()
    expect(result.current.getSelection()).toBeNull()
  })

  it('deletes the selected pixels as one undo step', () => {
    const { run, pixel, dot } = setup()
    dot(1, 1, RED)
    dot(5, 5, RED)
    run(e => e.setSelection({ x: 0, y: 0, width: 3, height: 3 }))
    run(e => e.deleteSelection())
    expect(pixel(1, 1)).toBe(TRANSPARENT)
    expect(pixel(5, 5)).toBe(RED)
    run(e => e.undo())
    expect(pixel(1, 1)).toBe(RED)
  })
})

describe('useEditor frames', () => {
  const frameCount = (r: ReturnType<typeof setup>['result']) => r.current.state.frames.length

  it('adds an empty frame after the current one and edits it', () => {
    const { result, run, pixel, dot } = setup()
    dot(0, 0, RED)
    run(e => e.addFrame())
    expect(frameCount(result)).toBe(2)
    expect(result.current.state.currentFrame).toBe(1)
    expect(pixel(0, 0)).toBe(TRANSPARENT)
    dot(1, 1, BLUE)
    run(e => e.selectFrame(0))
    expect(pixel(0, 0)).toBe(RED)
    expect(pixel(1, 1)).toBe(TRANSPARENT)
  })

  it('duplicates a frame, and painting the copy leaves the original alone', () => {
    const { result, run, pixel, dot } = setup()
    dot(0, 0, RED)
    run(e => e.duplicateFrame())
    expect(pixel(0, 0)).toBe(RED)
    dot(0, 0, BLUE)
    expect(result.current.state.frames[0].pixels[0][0]).toBe(RED)
    expect(result.current.state.frames[1].pixels[0][0]).toBe(BLUE)
  })

  it('keeps at least one frame', () => {
    const { result, run } = setup()
    let removed = true
    run(e => {
      removed = e.deleteFrame()
    })
    expect(removed).toBe(false)
    expect(frameCount(result)).toBe(1)
  })

  it('deletes the current frame and undo brings it back', () => {
    const { result, run, pixel, dot } = setup()
    run(e => e.addFrame())
    dot(2, 2, RED)
    run(e => e.deleteFrame())
    expect(frameCount(result)).toBe(1)
    expect(pixel(2, 2)).toBe(TRANSPARENT)
    run(e => e.undo())
    expect(frameCount(result)).toBe(2)
    expect(result.current.state.currentFrame).toBe(1)
    expect(pixel(2, 2)).toBe(RED)
  })

  it('moves a frame and keeps it selected', () => {
    const { result, run, dot } = setup()
    dot(0, 0, RED)
    run(e => e.addFrame())
    dot(0, 0, BLUE)
    run(e => e.moveFrame(1, 0))
    expect(result.current.state.frames.map(f => f.pixels[0][0])).toEqual([BLUE, RED])
    expect(result.current.state.currentFrame).toBe(0)
  })

  it('does not record switching frames as an undo step', () => {
    const { result, run } = setup()
    run(e => e.addFrame())
    run(e => e.selectFrame(0))
    run(e => e.undo())
    expect(frameCount(result)).toBe(1)
  })

  it('shows the frame that an undo changes', () => {
    const { result, run, dot } = setup()
    run(e => e.addFrame())
    dot(3, 3, RED)
    run(e => e.selectFrame(0))
    run(e => e.undo())
    expect(result.current.state.currentFrame).toBe(1)
    expect(result.current.state.frames[1].pixels[3][3]).toBe(TRANSPARENT)
  })

  it('resizes every frame', () => {
    const { result, run, dot } = setup()
    run(e => e.addFrame())
    dot(1, 1, RED)
    run(e => e.resizeCanvas(4, 2))
    expect(result.current.state.frames.map(f => [f.width, f.height, f.pixels.length])).toEqual([
      [4, 2, 2],
      [4, 2, 2],
    ])
    expect(result.current.state.frames[1].pixels[1][1]).toBe(RED)
  })

  it('maps every frame to the palette when nothing is selected', () => {
    const { result, run, dot } = setup()
    dot(0, 0, '#fe0000')
    run(e => e.addFrame())
    dot(0, 0, '#0000fe')
    let changed = 0
    run(e => {
      changed = e.remapColors(paletteSnapper([RED, BLUE]))
    })
    expect(changed).toBe(2)
    expect(result.current.state.frames.map(f => f.pixels[0][0])).toEqual([RED, BLUE])
  })

  it('imports several frames and their speed with a fresh history', () => {
    const { result, run } = setup()
    run(e => e.importFrames([[[RED]], [[BLUE]]], 1, 1, 12))
    expect(result.current.state.frames.map(f => f.pixels)).toEqual([[[RED]], [[BLUE]]])
    expect(result.current.state.currentFrame).toBe(0)
    expect(result.current.state.fps).toBe(12)
    expect(result.current.canUndo).toBe(false)
  })

  it('keeps the speed between 1 and 60 frames per second', () => {
    const { result, run } = setup()
    run(e => e.setFps(0))
    expect(result.current.state.fps).toBe(1)
    run(e => e.setFps(500))
    expect(result.current.state.fps).toBe(60)
  })
})
