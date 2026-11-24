// End-to-end tests: WebdriverIO drives the compiled app through tauri-driver, so they cover what
// the unit tests cannot: the real webview, the content security policy, and the calls to Rust.
//
// Build the app first (`pnpm tauri build --debug --no-bundle`), then run `pnpm test:e2e`.
// tauri-driver works on Linux (WebKitWebDriver) and Windows (msedgedriver), not on macOS.
// The app reads and writes its real data folder, so the CI runs them with a throwaway one.
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exe = process.platform === 'win32' ? '.exe' : ''
const application = process.env.E2E_APP ?? path.join(root, 'src-tauri', 'target', 'debug', `pixel-art-editor${exe}`)
const driver = process.env.TAURI_DRIVER ?? path.join(os.homedir(), '.cargo', 'bin', `tauri-driver${exe}`)

let tauriDriver
let closing = false

export const config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: 4444,
  specs: [path.join(root, 'e2e', '*.e2e.mjs')],
  maxInstances: 1,
  capabilities: [{ maxInstances: 1, browserName: 'wry', 'tauri:options': { application } }],
  logLevel: 'warn',
  waitforTimeout: 10000,
  reporters: ['spec'],
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 60000 },

  // tauri-driver starts the app for each session and closes it when the session ends
  beforeSession() {
    tauriDriver = spawn(driver, [], { stdio: ['ignore', process.stdout, process.stderr] })
    tauriDriver.on('error', error => {
      console.error('tauri-driver could not start:', error.message)
      process.exit(1)
    })
    tauriDriver.on('exit', code => {
      if (closing) return
      console.error('tauri-driver exited with code', code)
      process.exit(1)
    })
  },

  afterSession() {
    closing = true
    tauriDriver?.kill()
  },
}
