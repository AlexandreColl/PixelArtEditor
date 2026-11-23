// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ColorPicker from './ColorPicker'
import CanvasSizeControl from './CanvasSizeControl'

afterEach(cleanup)

const hexField = () => screen.getByRole('textbox') as HTMLInputElement
const hue = () => Number(screen.getByRole('slider', { name: 'Hue' }).getAttribute('aria-valuenow'))

describe('ColorPicker', () => {
  it('follows a color chosen elsewhere', () => {
    const { rerender } = render(<ColorPicker color="#ff0000" onChange={() => {}} />)
    rerender(<ColorPicker color="#0000ff" onChange={() => {}} />)
    expect(hexField().value).toBe('#0000ff')
    expect(hue()).toBe(240)
  })

  it('sends a typed color and shows it when it comes back', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ColorPicker color="#ff0000" onChange={onChange} />)
    fireEvent.change(hexField(), { target: { value: '#00ff00' } })
    fireEvent.keyDown(hexField(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('#00ff00')
    rerender(<ColorPicker color="#00ff00" onChange={onChange} />)
    expect(hexField().value).toBe('#00ff00')
    expect(hue()).toBe(120)
  })
})

describe('CanvasSizeControl', () => {
  const sizes = () => screen.getAllByRole('spinbutton').map(i => (i as HTMLInputElement).value)

  it('follows the canvas size and keeps what is being typed until then', () => {
    const { rerender } = render(<CanvasSizeControl width={32} height={32} onResize={() => {}} />)
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '50' } })
    rerender(<CanvasSizeControl width={32} height={32} onResize={() => {}} />)
    expect(sizes()).toEqual(['50', '32'])
    rerender(<CanvasSizeControl width={64} height={16} onResize={() => {}} />)
    expect(sizes()).toEqual(['64', '16'])
  })
})
