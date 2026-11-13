import { describe, expect, it } from 'vitest'
import { fileBaseName, imageDataToPixels, needsConversion, withExtension } from './image'
import { TRANSPARENT } from './color'

/** An ImageData stand-in (Node has no canvas): every pixel gets the color returned by `color`. */
function image(width: number, height: number, color: (i: number) => number[] = () => [0, 0, 0, 255]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(color(i), i * 4)
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

describe('imageDataToPixels', () => {
  it('reads every pixel row by row in the canonical color format', () => {
    const colors = [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
      [0, 0, 255, 128],
      [1, 2, 3, 255],
    ]
    expect(imageDataToPixels(image(2, 2, i => colors[i]))).toEqual({
      width: 2,
      height: 2,
      pixels: [
        ['#ff0000', TRANSPARENT],
        ['rgba(0,0,255,0.502)', '#010203'],
      ],
    })
  })
})

describe('needsConversion', () => {
  it('opens small sprites with few colors as they are', () => {
    expect(needsConversion(image(128, 64))).toBe(false)
  })

  it('converts large images', () => {
    expect(needsConversion(image(129, 10))).toBe(true)
  })

  it('converts images with too many colors, like photos', () => {
    expect(needsConversion(image(32, 32, i => [i % 256, i >> 8, 0, 255]))).toBe(true)
  })
})

describe('fileBaseName', () => {
  it('drops the folders and the extension of Windows and POSIX paths', () => {
    expect(fileBaseName('C:\\art\\hero.walk.png')).toBe('hero.walk')
    expect(fileBaseName('/home/me/tiles.gif')).toBe('tiles')
  })

  it('falls back when there is no name', () => {
    expect(fileBaseName('C:\\art\\')).toBe('untitled')
    expect(fileBaseName('.png', 'image')).toBe('image')
  })
})

describe('withExtension', () => {
  it('adds the extension only when it is missing', () => {
    expect(withExtension('C:\\a\\b', 'png')).toBe('C:\\a\\b.png')
    expect(withExtension('C:\\a\\b.PNG', 'png')).toBe('C:\\a\\b.PNG')
  })
})
