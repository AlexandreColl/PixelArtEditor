use std::fs;
use std::path::Path;
use base64::Engine as _;

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

#[tauri::command]
fn save_png_file(path: String, base64_data: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !has_extension(p, &["png"]) {
        return Err("only .png files can be saved".to_string());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("base64 decode error: {}", e))?;

    write_file(p, &bytes)
}

#[tauri::command]
fn save_palette_file(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !has_extension(p, &["gpl", "hex"]) {
        return Err("only .gpl and .hex palettes can be saved".to_string());
    }
    write_file(p, contents.as_bytes())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![save_png_file, save_palette_file])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
    }
}
