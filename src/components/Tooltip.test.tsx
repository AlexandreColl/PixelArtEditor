// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import TooltipLayer, { tip } from './Tooltip'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup() {
  render(
    <>
      <TooltipLayer />
      <button {...tip('Pencil', 'B')}>
        <svg data-testid="icon" />
      </button>
      <button>Plain</button>
    </>,
  )
  return { button: screen.getByRole('button', { name: 'Pencil' }), plain: screen.getByText('Plain') }
}

const over = (el: Element) => act(() => void el.dispatchEvent(new Event('pointerover', { bubbles: true })))

describe('tip', () => {
  it('names the element for screen readers with the first line of the label', () => {
    expect(tip('Color\nCtrl+click: remove')['aria-label']).toBe('Color')
  })
})

describe('TooltipLayer', () => {
  it('shows the label and shortcut after a short delay, also when pointing at a child', () => {
    setup()
    over(screen.getByTestId('icon'))
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => void vi.advanceTimersByTime(400))
    expect(screen.getByRole('tooltip').textContent).toBe('PencilB')
  })

  it('hides when the pointer moves to an element without a tooltip', () => {
    const { button, plain } = setup()
    over(button)
    act(() => void vi.advanceTimersByTime(400))
    over(plain)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hides on click so it does not cover what was clicked', () => {
    const { button } = setup()
    over(button)
    act(() => void vi.advanceTimersByTime(400))
    act(() => void button.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('does not show if the pointer leaves before the delay', () => {
    const { button, plain } = setup()
    over(button)
    over(plain)
    act(() => void vi.advanceTimersByTime(400))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
