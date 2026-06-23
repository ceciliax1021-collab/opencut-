use std::fs;
use std::path::{Path, PathBuf};

const TEXTS_FILE: &str = "texts.json";
const METADATA_FILE: &str = "image_metadata.json";

pub fn migrate_legacy_data(app_data_dir: &Path, clips_dir: &Path) {
    fs::create_dir_all(clips_dir).ok();

    let mut sources: Vec<PathBuf> = Vec::new();

    if let Some(parent) = app_data_dir.parent() {
        
        sources.push(parent.join("com.opencut.app").join("clips"));
        sources.push(parent.join("com.opencut.app"));
    }

    
    sources.push(app_data_dir.join("uploads"));
    sources.push(app_data_dir.to_path_buf());

    
    if let Ok(home) = std::env::var("HOME") {
        sources.push(PathBuf::from(home).join("Downloads/opencut/uploads"));
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        sources.push(PathBuf::from(&profile).join("Downloads/opencut/uploads"));
    }

    for source in sources {
        if !should_import_from(&source, clips_dir) {
            continue;
        }
        import_from_legacy(&source, clips_dir);
    }
}

fn should_import_from(source: &Path, clips_dir: &Path) -> bool {
    if !source.exists() {
        return false;
    }
    if source == clips_dir {
        return false;
    }
    if let (Ok(a), Ok(b)) = (source.canonicalize(), clips_dir.canonicalize()) {
        if a == b {
            return false;
        }
    }
    true
}

fn import_from_legacy(source: &Path, target: &Path) {
    let entries = match fs::read_dir(source) {
        Ok(v) => v,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let file_name = name.to_string_lossy();

        if file_name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            continue;
        }

        if file_name == TEXTS_FILE {
            merge_json_array_file(&path, &target.join(TEXTS_FILE));
            continue;
        }

        if file_name == METADATA_FILE {
            merge_metadata_file(&path, &target.join(METADATA_FILE));
            continue;
        }

        let dest = target.join(&name);
        if !dest.exists() {
            let _ = fs::copy(&path, &dest);
        }
    }
}

fn merge_json_array_file(from: &Path, to: &Path) {
    let from_items: Vec<serde_json::Value> = read_json(from).unwrap_or_default();
    if from_items.is_empty() {
        return;
    }

    let mut to_items: Vec<serde_json::Value> = read_json(to).unwrap_or_default();
    let mut existing: std::collections::HashSet<String> = to_items
        .iter()
        .filter_map(|v| v.get("id").and_then(|id| id.as_str()).map(str::to_string))
        .collect();

    for item in from_items {
        if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            if existing.insert(id.to_string()) {
                to_items.push(item);
            }
        }
    }

    write_json(to, &to_items);
}

fn merge_metadata_file(from: &Path, to: &Path) {
    let from_store: serde_json::Value = read_json(from).unwrap_or(serde_json::json!({}));
    let to_store: serde_json::Value = read_json(to).unwrap_or(serde_json::json!({
        "groups": [{"id":"default","name":"默认分类","createdAt":0}],
        "imageMetadata": []
    }));

    let mut merged = to_store.clone();
    if let Some(from_groups) = from_store.get("groups").and_then(|v| v.as_array()) {
        let groups = merged
            .as_object_mut()
            .and_then(|m| m.get_mut("groups"))
            .and_then(|v| v.as_array_mut());
        if let Some(groups) = groups {
            let existing: std::collections::HashSet<String> = groups
                .iter()
                .filter_map(|g| g.get("id").and_then(|id| id.as_str()).map(str::to_string))
                .collect();
            for group in from_groups {
                if let Some(id) = group.get("id").and_then(|v| v.as_str()) {
                    if !existing.contains(id) {
                        groups.push(group.clone());
                    }
                }
            }
        }
    }

    if let Some(from_meta) = from_store.get("imageMetadata").and_then(|v| v.as_array()) {
        let meta = merged
            .as_object_mut()
            .and_then(|m| m.get_mut("imageMetadata"))
            .and_then(|v| v.as_array_mut());
        if let Some(meta) = meta {
            let existing: std::collections::HashSet<String> = meta
                .iter()
                .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(str::to_string))
                .collect();
            for item in from_meta {
                if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                    if !existing.contains(id) {
                        meta.push(item.clone());
                    }
                }
            }
        }
    }

    write_json(to, &merged);
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    if !path.exists() {
        return None;
    }
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) {
    if let Ok(data) = serde_json::to_string_pretty(value) {
        let _ = fs::write(path, data);
    }
}
