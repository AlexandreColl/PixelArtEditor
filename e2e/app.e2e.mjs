// The compiled app, driven like a person would: one session, in order, ending with a restart.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { $, $$, browser, expect } from '@wdio/globals'

/** Calls a Rust command from the page, the way the app does. Never throws: returns the outcome. */
function invoke(command, args = {}) {
  return browser.execute(
    (c, a) =>
      // oxlint-disable-next-line no-underscore-dangle -- the object Tauri gives the page
      window.__TAURI_INTERNALS__.invoke(c, a).then(
        value => ({ ok: true, value }),
        error => ({ ok: false, error: String(error) }),
      ),
    command,
    args,
  )
}

/** The copy of unsaved work as the Rust side keeps it, or null. */
async function autosaved() {
  const { ok, value, error } = await invoke('read_autosave')
  if (!ok) throw new Error(`read_autosave failed: ${error}`)
  return value === null ? null : JSON.parse(value)
}

// The color picker and the previews are canvases too
const CANVAS = 'canvas[aria-label="Drawing canvas"]'
const frames = () => $$('[aria-label="Frames"] [aria-label^="Frame "]')

describe('Pixel Art Editor', () => {
  before(async () => {
    await $(CANVAS).waitForDisplayed()
    // Collects whatever the content security policy blocks from here on
    await browser.execute(() => {
      window.cspViolations = []
      document.addEventListener('securitypolicyviolation', e =>
        window.cspViolations.push(`${e.effectiveDirective} ${e.blockedURI}`),
      )
    })
  })

  it('opens ready to draw, with nothing to undo or recover', async () => {
    await expect($(CANVAS)).toBeDisplayed()
    await expect($('button[aria-label="Undo"]')).toBeDisabled()
    await expect($('[aria-label="Recover unsaved work?"]')).not.toBeExisting()
  })

  it('runs under the content security policy', async () => {
    const outcome = await browser.execute(() =>
      fetch('https://example.com/').then(
        () => 'allowed',
        () => 'blocked',
      ),
    )
    expect(outcome).toBe('blocked')
    await browser.waitUntil(() => browser.execute(() => window.cspViolations.some(v => v.startsWith('connect-src'))), {
      timeoutMsg: 'the blocked request was not reported as a connect-src violation',
    })
    await browser.execute(() => (window.cspViolations = []))
  })

  it('draws with the pencil', async () => {
    await $('button[aria-label="Pencil"]').click()
    const canvas = await $(CANVAS)
    await browser
      .action('pointer')
      .move({ origin: canvas, x: 0, y: 0 })
      .down()
      .move({ origin: canvas, x: 30, y: 0, duration: 100 })
      .up()
      .perform()
    await expect($('button[aria-label="Undo"]')).toBeEnabled()
    await expect($('[aria-label="Unsaved changes (kept by autosave)"]')).toBeExisting()
  })

  it('adds frames', async () => {
    await $('button[aria-label="Duplicate frame"]').click()
    await expect(frames()).toBeElementsArrayOfSize(2)
  })

  it('keeps the unsaved work in the app data folder, through Rust', async () => {
    let saved = null
    await browser.waitUntil(
      async () => {
        saved = await autosaved()
        return saved !== null && JSON.parse(saved.project).frames.length === 2
      },
      { timeout: 15000, timeoutMsg: 'the autosave never reached the app data folder' },
    )
    const project = JSON.parse(saved.project)
    // What the pencil drew, in the default color
    expect(project.colors).toContain('#000000')
  })

  it('writes only the file types it is allowed to', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pae-e2e-'))
    const pxa = path.join(dir, 'hero.pxa')
    const exe = path.join(dir, 'hero.exe')

    expect(await invoke('save_project_file', { path: pxa, contents: '{"ok":1}' })).toEqual({ ok: true, value: null })
    expect(fs.readFileSync(pxa, 'utf8')).toBe('{"ok":1}')

    const refused = await invoke('save_project_file', { path: exe, contents: 'MZ' })
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain('only .pxa projects can be saved')
    expect(fs.existsSync(exe)).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('has not been blocked by the content security policy along the way', async () => {
    expect(await browser.execute(() => window.cspViolations)).toEqual([])
  })

  it('offers the unsaved work again after a restart', async () => {
    // Ends this session, which closes the app, and starts it again
    await browser.reloadSession()
    const dialog = await $('[aria-label="Recover unsaved work?"]')
    await dialog.waitForDisplayed()
    await expect(dialog).toHaveText(expect.stringContaining('2 frames'))
    await $('button=Recover').click()
    await expect($('[role="status"]')).toHaveText('Recovered unsaved work')
    await expect(frames()).toBeElementsArrayOfSize(2)
  })
})
