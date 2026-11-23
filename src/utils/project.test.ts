import { describe, expect, it } from 'vitest'
import type { EditorDocument } from '../hooks/useEditor'
import { TRANSPARENT as T } from './color'
import { parseProject, serializeProject } from './project'

const R = '#ff0000'
const B = '#0000ff'

const doc: EditorDocument = {
  width: 3,
  height: 2,
  fps: 12,
  durations: [null, 250],
  layers: [
    { name: 'Background', visible: true, opacity: 1 },
    { name: 'Glow', visible: false, opacity: 0.4 },
  ],
  cels: [
    [
      [
        [R, R, R],
        [R, B, T],
      ],
      [
        [T, T, T],
        [T, T, 'rgba(255,0,0,0.502)'],
      ],
    ],
    [
      [
        [B, B, B],
        [B, B, B],
      ],
      [
        [T, T, T],
        [T, T, T],
      ],
    ],
  ],
}

describe('project files', () => {
  it('round trips every frame, layer and setting', () => {
    expect(parseProject(serializeProject(doc))).toEqual(doc)
  })

  it('opens files without durations, from before they existed, with every frame following fps', () => {
    const file = JSON.parse(serializeProject({ ...doc, durations: [null, null] }))
    expect(file.durations).toBeUndefined()
    expect(parseProject(JSON.stringify(file)).durations).toEqual([null, null])
  })

  it('stores repeated pixels as runs', () => {
    const file = JSON.parse(serializeProject(doc))
    // Second frame, bottom layer: six blue pixels in a single run
    expect(file.frames[1][0]).toEqual([6, file.colors.indexOf(B)])
    expect(file.colors[0]).toBe(T)
  })

  it('rejects other files with a clear message', () => {
    expect(() => parseProject('not json')).toThrow('Not a Pixel Art Editor project')
    expect(() => parseProject('{"format":"other"}')).toThrow('Not a Pixel Art Editor project')
  })

  it('refuses projects from a newer version', () => {
    const file = JSON.parse(serializeProject(doc))
    expect(() => parseProject(JSON.stringify({ ...file, version: 99 }))).toThrow('newer version')
  })

  it('rejects damaged pixel data instead of opening a broken image', () => {
    const file = JSON.parse(serializeProject(doc))
    const tooShort = {
      ...file,
      frames: [
        [
          [5, 1],
          [6, 0],
        ],
      ],
    }
    const badColor = {
      ...file,
      frames: [
        [
          [6, 99],
          [6, 0],
        ],
      ],
    }
    const missingLayer = { ...file, frames: [[[6, 1]]] }
    for (const broken of [tooShort, badColor, missingLayer]) {
      expect(() => parseProject(JSON.stringify(broken))).toThrow('damaged')
    }
    expect(() => parseProject(JSON.stringify({ ...file, width: 0 }))).toThrow('canvas size')
  })

  it('fills in missing layer settings', () => {
    const file = JSON.parse(serializeProject(doc))
    file.layers = [{}, { name: '  ', opacity: 7 }]
    const parsed = parseProject(JSON.stringify(file))
    expect(parsed.layers).toEqual([
      { name: 'Layer 1', visible: true, opacity: 1 },
      { name: 'Layer 2', visible: true, opacity: 1 },
    ])
  })
})
