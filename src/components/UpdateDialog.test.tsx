// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import UpdateDialog from './UpdateDialog'

afterEach(cleanup)

const notes = '### Añadido\n\n- Herramienta de **mover**\n- Atajo `M`'

describe('UpdateDialog', () => {
  it('shows the versions and the notes without markdown markers', () => {
    render(
      <UpdateDialog
        status={{ phase: 'available', version: '0.6.0', currentVersion: '0.5.2', notes }}
        onInstall={() => {}}
        onLater={() => {}}
      />,
    )
    expect(screen.getByText('Pixel Art Editor 0.6.0 is available')).toBeTruthy()
    expect(screen.getByText('You have 0.5.2')).toBeTruthy()
    expect(screen.getByText('Añadido')).toBeTruthy()
    expect(screen.getByText('Herramienta de mover')).toBeTruthy()
    expect(screen.getByText('Atajo M')).toBeTruthy()
  })

  it('installs on confirm and cannot be closed while installing', () => {
    const onInstall = vi.fn()
    const onLater = vi.fn()
    const status = { version: '0.6.0', currentVersion: '0.5.2', notes: '' }
    const { rerender } = render(
      <UpdateDialog status={{ phase: 'available', ...status }} onInstall={onInstall} onLater={onLater} />,
    )
    fireEvent.click(screen.getByText('Install and restart'))
    expect(onInstall).toHaveBeenCalledOnce()
    rerender(
      <UpdateDialog
        status={{ phase: 'installing', progress: 0.4, ...status }}
        onInstall={onInstall}
        onLater={onLater}
      />,
    )
    expect(screen.getByText('Downloading… 40%')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByText('Later'))
    expect(onLater).not.toHaveBeenCalled()
  })
})
