use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use arboard::{Clipboard, ImageData};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::models::{Group, ImagesResponse, TextClip, UploadedImage};
use crate::storage::Storage;

pub struct AppState {
    pub storage: Storage,
    pub skip_clipboard_watch: AtomicBool,
    pub last_clipboard_hash: Mutex<Option<u64>>,
}

#[tauri::command]
pub fn get_images(state: State<'_, Arc<AppState>>) -> Result<ImagesResponse, String> {
    state.storage.list_images()
}

#[tauri::command]
pub fn upload_image(
    state: State<'_, Arc<AppState>>,
    bytes: Vec<u8>,
    original_name: Option<String>,
    group_id: Option<String>,
) -> Result<UploadedImage, String> {
    state.storage.save_image(
        &bytes,
        original_name.as_deref(),
        group_id.as_deref(),
    )
}

#[tauri::command]
pub fn delete_image(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.storage.delete_image(&id)
}

#[tauri::command]
pub fn rename_image(
    state: State<'_, Arc<AppState>>,
    id: String,
    name: String,
) -> Result<crate::models::ImageMetadata, String> {
    if name.trim().is_empty() {
        return Err("Name is required".into());
    }
    let mut store = state.storage.read_metadata();
    if let Some(idx) = store.image_metadata.iter().position(|m| m.id == id) {
        store.image_metadata[idx].name = name.trim().into();
        let updated = store.image_metadata[idx].clone();
        state.storage.write_metadata(&store)?;
        return Ok(updated);
    }
    let new_meta = crate::models::ImageMetadata {
        id: id.clone(),
        name: name.trim().into(),
        group_id: "default".into(),
    };
    store.image_metadata.push(new_meta.clone());
    state.storage.write_metadata(&store)?;
    Ok(new_meta)
}

#[tauri::command]
pub fn move_images(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
    group_id: String,
) -> Result<(), String> {
    let mut store = state.storage.read_metadata();
    if group_id != "default" && !store.groups.iter().any(|g| g.id == group_id) {
        return Err("Target group does not exist".into());
    }
    let id_set: std::collections::HashSet<_> = ids.into_iter().collect();
    for meta in store.image_metadata.iter_mut() {
        if id_set.contains(&meta.id) {
            meta.group_id = group_id.clone();
        }
    }
    for id in &id_set {
        if !store.image_metadata.iter().any(|m| m.id == *id) {
            store.image_metadata.push(crate::models::ImageMetadata {
                id: id.clone(),
                name: id.clone(),
                group_id: group_id.clone(),
            });
        }
    }
    state.storage.write_metadata(&store)
}

#[tauri::command]
pub fn create_group(state: State<'_, Arc<AppState>>, name: String) -> Result<Group, String> {
    if name.trim().is_empty() {
        return Err("Group name is required".into());
    }
    let mut store = state.storage.read_metadata();
    let id = format!("{:x}", md5::compute(format!("{}-{}", name, now_ms())));
    let group = Group {
        id,
        name: name.trim().into(),
        created_at: now_ms(),
    };
    store.groups.push(group.clone());
    state.storage.write_metadata(&store)?;
    Ok(group)
}

#[tauri::command]
pub fn rename_group(state: State<'_, Arc<AppState>>, id: String, name: String) -> Result<Group, String> {
    if id == "default" {
        return Err("Cannot rename default group".into());
    }
    if name.trim().is_empty() {
        return Err("Group name is required".into());
    }
    let mut store = state.storage.read_metadata();
    let group = store
        .groups
        .iter_mut()
        .find(|g| g.id == id)
        .ok_or_else(|| "Group not found".to_string())?;
    group.name = name.trim().into();
    let updated = group.clone();
    state.storage.write_metadata(&store)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_group(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    if id == "default" {
        return Err("Cannot delete default group".into());
    }
    let mut store = state.storage.read_metadata();
    store.groups.retain(|g| g.id != id);
    for meta in store.image_metadata.iter_mut() {
        if meta.group_id == id {
            meta.group_id = "default".into();
        }
    }
    state.storage.write_metadata(&store)
}

#[tauri::command]
pub fn get_texts(state: State<'_, Arc<AppState>>) -> Result<Vec<TextClip>, String> {
    Ok(state.storage.read_texts())
}

#[tauri::command]
pub fn save_text(state: State<'_, Arc<AppState>>, content: String) -> Result<TextClip, String> {
    if content.trim().is_empty() {
        return Err("Content must be non-empty".into());
    }
    let mut texts = state.storage.read_texts();
    if let Some(idx) = texts.iter().position(|t| t.content == content) {
        let mut existing = texts.remove(idx);
        existing.created_at = now_ms();
        texts.insert(0, existing.clone());
        state.storage.write_texts(&texts)?;
        return Ok(existing);
    }

    let clip = TextClip {
        id: format!("{:x}", md5::compute(format!("{}-{}", content, now_ms()))),
        content,
        created_at: now_ms(),
        is_pinned: false,
    };
    texts.insert(0, clip.clone());

    if texts.len() > 100 {
        let pinned: Vec<_> = texts.iter().filter(|t| t.is_pinned).cloned().collect();
        let unpinned: Vec<_> = texts.iter().filter(|t| !t.is_pinned).cloned().collect();
        let keep = 100usize.saturating_sub(pinned.len());
        texts = pinned;
        texts.extend(unpinned.into_iter().take(keep));
    }

    state.storage.write_texts(&texts)?;
    Ok(clip)
}

#[tauri::command]
pub fn toggle_pin_text(state: State<'_, Arc<AppState>>, id: String) -> Result<TextClip, String> {
    let mut texts = state.storage.read_texts();
    let text = texts
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| "Text clip not found".to_string())?;
    text.is_pinned = !text.is_pinned;
    let updated = text.clone();
    state.storage.write_texts(&texts)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_text(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let texts = state.storage
        .read_texts()
        .into_iter()
        .filter(|t| t.id != id)
        .collect::<Vec<_>>();
    state.storage.write_texts(&texts)
}

#[tauri::command]
pub fn update_text(state: State<'_, Arc<AppState>>, id: String, content: String) -> Result<TextClip, String> {
    if content.trim().is_empty() {
        return Err("Content must be non-empty".into());
    }
    let mut texts = state.storage.read_texts();
    let text = texts
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| "Text clip not found".to_string())?;
    text.content = content;
    let updated = text.clone();
    state.storage.write_texts(&texts)?;
    Ok(updated)
}

#[tauri::command]
pub fn clear_unpinned_texts(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let texts = state.storage
        .read_texts()
        .into_iter()
        .filter(|t| t.is_pinned)
        .collect::<Vec<_>>();
    state.storage.write_texts(&texts)
}

#[tauri::command]
pub fn copy_image_to_clipboard(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let path = state.storage.image_path(&id);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    write_image_bytes_to_clipboard(&state, &bytes)
}

#[tauri::command]
pub fn copy_text_to_clipboard(state: State<'_, Arc<AppState>>, content: String) -> Result<(), String> {
    state.skip_clipboard_watch.store(true, Ordering::SeqCst);
    let result = Clipboard::new()
        .and_then(|mut cb| cb.set_text(content))
        .map_err(|e| e.to_string());
    std::thread::sleep(std::time::Duration::from_millis(300));
    state.skip_clipboard_watch.store(false, Ordering::SeqCst);
    result
}

pub fn write_image_bytes_to_clipboard(state: &AppState, bytes: &[u8]) -> Result<(), String> {
    state.skip_clipboard_watch.store(true, Ordering::SeqCst);
    let image = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let result = Clipboard::new()
        .and_then(|mut cb| {
            cb.set_image(ImageData {
                width: width as usize,
                height: height as usize,
                bytes: rgba.into_raw().into(),
            })
        })
        .map_err(|e| e.to_string());
    std::thread::sleep(std::time::Duration::from_millis(300));
    state.skip_clipboard_watch.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub fn open_local_image(state: State<'_, Arc<AppState>>, path: String) -> Result<(), String> {
    let resolved = state.storage.resolve_clip_path(&path)?;
    if !resolved.is_file() {
        return Err("Image file not found".into());
    }
    open::that(&resolved).map_err(|e| e.to_string())
}

pub fn start_clipboard_watcher(app: AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => c,
            Err(_) => return,
        };

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            if state.skip_clipboard_watch.load(Ordering::SeqCst) {
                continue;
            }

            let hash = match read_clipboard_hash(&mut clipboard) {
                Some(h) => h,
                None => continue,
            };

            {
                let mut last = state.last_clipboard_hash.lock();
                if last.map(|v| v == hash).unwrap_or(false) {
                    continue;
                }
                *last = Some(hash);
            }

            if let Some(bytes) = read_clipboard_image(&mut clipboard) {
                match state.storage.save_image(&bytes, None, None) {
                    Ok(_) => {
                        let _ = app.emit("clip-updated", "image");
                    }
                    Err(_) => {}
                }
                continue;
            }

            if let Some(text) = read_clipboard_text(&mut clipboard) {
                if text.trim().is_empty() {
                    continue;
                }
                match save_text_internal(&state, text) {
                    Ok(_) => {
                        let _ = app.emit("clip-updated", "text");
                    }
                    Err(_) => {}
                }
            }
        }
    });
}

fn save_text_internal(state: &AppState, content: String) -> Result<TextClip, String> {
    let mut texts = state.storage.read_texts();
    if let Some(idx) = texts.iter().position(|t| t.content == content) {
        let mut existing = texts.remove(idx);
        existing.created_at = now_ms();
        texts.insert(0, existing.clone());
        state.storage.write_texts(&texts)?;
        return Ok(existing);
    }
    let clip = TextClip {
        id: format!("{:x}", md5::compute(format!("{}-{}", content, now_ms()))),
        content,
        created_at: now_ms(),
        is_pinned: false,
    };
    texts.insert(0, clip.clone());
    if texts.len() > 100 {
        let pinned: Vec<_> = texts.iter().filter(|t| t.is_pinned).cloned().collect();
        let unpinned: Vec<_> = texts.iter().filter(|t| !t.is_pinned).cloned().collect();
        let keep = 100usize.saturating_sub(pinned.len());
        texts = pinned;
        texts.extend(unpinned.into_iter().take(keep));
    }
    state.storage.write_texts(&texts)?;
    Ok(clip)
}

fn read_clipboard_hash(clipboard: &mut Clipboard) -> Option<u64> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    if let Ok(image) = clipboard.get_image() {
        let mut hasher = DefaultHasher::new();
        image.bytes.hash(&mut hasher);
        image.width.hash(&mut hasher);
        image.height.hash(&mut hasher);
        return Some(hasher.finish());
    }
    if let Ok(text) = clipboard.get_text() {
        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        return Some(hasher.finish());
    }
    None
}

fn read_clipboard_image(clipboard: &mut Clipboard) -> Option<Vec<u8>> {
    let image = clipboard.get_image().ok()?;
    let mut buf = Vec::new();
    let img = image::RgbaImage::from_raw(
        image.width as u32,
        image.height as u32,
        image.bytes.into(),
    )?;
    img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .ok()?;
    Some(buf)
}

fn read_clipboard_text(clipboard: &mut Clipboard) -> Option<String> {
    clipboard.get_text().ok()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
