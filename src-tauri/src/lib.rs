use base64::Engine as _;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// The copy of unsaved work, in the app data folder.
const AUTOSAVE_FILE: &str = "autosave.json";

/// The webview can only ask for files with one of these extensions to be written.
fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| allowed.iter().any(|a| ext.eq_ignore_ascii_case(a)))
}

fn write_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir error: {}", e))?;
    }
    fs::write(path, bytes).map_err(|e| format!("write error: {}", e))
}

fn write_base64_file(path: &Path, base64_data: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("base64 decode error: {}", e))?;
    write_file(path, &bytes)
}

#[tauri::command]
fn save_png_file(path: String, base64_data: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !has_extension(p, &["png"]) {
        return Err("only .png files can be saved".to_string());
    }
    write_base64_file(p, &base64_data)
}

#[tauri::command]
fn save_gif_file(path: String, base64_data: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !has_extension(p, &["gif"]) {
        return Err("only .gif files can be saved".to_string());
    }
    write_base64_file(p, &base64_data)
}

#[tauri::command]
fn save_project_file(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !has_extension(p, &["pxa"]) {
        return Err("only .pxa projects can be saved".to_string());
    }
    write_file(p, contents.as_bytes())
}

#[tauri::command]
fn save_palette_file(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !has_extension(p, &["gpl", "hex"]) {
        return Err("only .gpl and .hex palettes can be saved".to_string());
    }
    write_file(p, contents.as_bytes())
}

/// Writes to a temporary file and renames it over the target, so a crash mid-write
/// leaves the previous copy instead of a half-written one.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    write_file(&tmp, bytes)?;
    fs::rename(&tmp, path).map_err(|e| format!("rename error: {}", e))
}

fn read_if_exists(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read error: {}", e)),
    }
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(format!("remove error: {}", e)),
        _ => Ok(()),
    }
}

fn autosave_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(AUTOSAVE_FILE))
        .map_err(|e| format!("no app data folder: {}", e))
}

#[tauri::command]
fn write_autosave(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    write_atomic(&autosave_path(&app)?, contents.as_bytes())
}

#[tauri::command]
fn read_autosave(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_if_exists(&autosave_path(&app)?)
}

#[tauri::command]
fn delete_autosave(app: tauri::AppHandle) -> Result<(), String> {
    remove_if_exists(&autosave_path(&app)?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            save_png_file,
            save_gif_file,
            save_project_file,
            save_palette_file,
            write_autosave,
            read_autosave,
            delete_autosave
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_allowed_extensions_pass() {
        assert!(has_extension(Path::new("a/b.PNG"), &["png"]));
        assert!(has_extension(Path::new("pal.hex"), &["gpl", "hex"]));
        assert!(!has_extension(Path::new("pal.hex.exe"), &["gpl", "hex"]));
        assert!(!has_extension(Path::new("noext"), &["png"]));
        assert!(!has_extension(Path::new("anim.gif"), &["png"]));
        assert!(has_extension(Path::new("hero.PXA"), &["pxa"]));
    }

    #[test]
    fn autosave_file_round_trips_and_disappears() {
        let dir = std::env::temp_dir().join(format!("pae-autosave-test-{}", std::process::id()));
        let path = dir.join(AUTOSAVE_FILE);
        assert_eq!(read_if_exists(&path).unwrap(), None);

        write_atomic(&path, b"first").unwrap();
        write_atomic(&path, b"second").unwrap();
        assert_eq!(read_if_exists(&path).unwrap().as_deref(), Some("second"));
        // The temporary file is renamed away, not left behind
        assert!(!path.with_extension("tmp").exists());

        remove_if_exists(&path).unwrap();
        remove_if_exists(&path).unwrap();
        assert_eq!(read_if_exists(&path).unwrap(), None);
        let _ = fs::remove_dir_all(&dir);
    }
}
