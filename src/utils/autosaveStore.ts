import { invoke, isTauri } from '@tauri-apps/api/core'

/** Where version 0.5.0 kept the copy, and where it is kept when running in a plain browser */
export const AUTOSAVE_KEY = 'autosave'

/** Where the copy of unsaved work lives. Each call either finishes or rejects. */
export interface AutosaveStore {
  read(): Promise<string | null>
  write(contents: string): Promise<void>
  remove(): Promise<void>
}

/** The webview's local storage: small (a few MB) but always there. Used outside the desktop app. */
export const browserStore: AutosaveStore = {
  read: async () => localStorage.getItem(AUTOSAVE_KEY),
  write: async contents => localStorage.setItem(AUTOSAVE_KEY, contents),
  remove: async () => localStorage.removeItem(AUTOSAVE_KEY),
}

/** A file in the app data folder, written by the Rust side, with no size limit. */
export const fileStore: AutosaveStore = {
  async read() {
    // A copy left by 0.5.0 in local storage is still offered once after upgrading
    return (await invoke<string | null>('read_autosave')) ?? localStorage.getItem(AUTOSAVE_KEY)
  },
  write: contents => invoke('write_autosave', { contents }),
  async remove() {
    localStorage.removeItem(AUTOSAVE_KEY)
    await invoke('delete_autosave')
  },
}

export function defaultAutosaveStore(): AutosaveStore {
  return isTauri() ? fileStore : browserStore
}
