use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;

use crate::models::{Group, ImageMetadata, MetadataStore, TextClip, UploadedImage, ImagesResponse};

const TEXTS_FILE: &str = "texts.json";
const METADATA_FILE: &str = "image_metadata.json";

pub struct Storage {
    root: PathBuf,
}

impl Storage {
    pub fn new(root: PathBuf) -> Self {
        fs::create_dir_all(&root).ok();
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    
    pub fn resolve_clip_path(&self, path: &str) -> Result<PathBuf, String> {
        let root = self
            .root
            .canonicalize()
            .map_err(|e| format!("Invalid data directory: {e}"))?;

        let candidate = PathBuf::from(path);
        let resolved = if candidate.is_absolute() {
            candidate.canonicalize()
        } else {
            root.join(&candidate).canonicalize()
        }
        .map_err(|e| format!("Invalid file path: {e}"))?;

        if !resolved.starts_with(&root) {
            return Err("Access denied: path is outside local data directory".into());
        }

        Ok(resolved)
    }

    fn texts_path(&self) -> PathBuf {
        self.root.join(TEXTS_FILE)
    }

    fn metadata_path(&self) -> PathBuf {
        self.root.join(METADATA_FILE)
    }

    pub fn image_path(&self, id: &str) -> PathBuf {
        self.root.join(sanitize_filename(id))
    }

    pub fn read_texts(&self) -> Vec<TextClip> {
        read_json(&self.texts_path()).unwrap_or_default()
    }

    pub fn write_texts(&self, texts: &Vec<TextClip>) -> Result<(), String> {
        write_json(&self.texts_path(), texts)
    }

    pub fn read_metadata(&self) -> MetadataStore {
        read_json(&self.metadata_path()).unwrap_or_else(|_| MetadataStore {
            groups: vec![Group {
                id: "default".into(),
                name: "默认分类".into(),
                created_at: now_ms(),
            }],
            image_metadata: vec![],
        })
    }

    pub fn write_metadata(&self, store: &MetadataStore) -> Result<(), String> {
        write_json(&self.metadata_path(), store)
    }

    pub fn list_images(&self) -> Result<ImagesResponse, String> {
        let mut store = self.read_metadata();
        let entries = fs::read_dir(&self.root).map_err(|e| e.to_string())?;

        let mut valid_files = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !is_image_file(&name) {
                continue;
            }
            valid_files.push(name);
        }

        let file_set: std::collections::HashSet<_> = valid_files.iter().cloned().collect();
        let before = store.image_metadata.len();
        store.image_metadata.retain(|m| file_set.contains(&m.id));
        let mut changed = store.image_metadata.len() != before;

        let tracked: std::collections::HashSet<_> =
            store.image_metadata.iter().map(|m| m.id.clone()).collect();
        for file in &valid_files {
            if !tracked.contains(file) {
                store.image_metadata.push(ImageMetadata {
                    id: file.clone(),
                    name: file.clone(),
                    group_id: "default".into(),
                });
                changed = true;
            }
        }

        if changed {
            self.write_metadata(&store)?;
        }

        let mut images = Vec::new();
        for file in valid_files {
            let meta = store
                .image_metadata
                .iter()
                .find(|m| m.id == file)
                .cloned()
                .unwrap_or(ImageMetadata {
                    id: file.clone(),
                    name: file.clone(),
                    group_id: "default".into(),
                });

            let path = self.image_path(&file);
            let created_at = fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(now_ms());

            images.push(UploadedImage {
                id: file.clone(),
                url: path.to_string_lossy().into_owned(),
                name: meta.name,
                group_id: meta.group_id,
                created_at,
            });
        }

        images.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(ImagesResponse {
            groups: store.groups,
            images,
        })
    }

    pub fn save_image(
        &self,
        bytes: &[u8],
        original_name: Option<&str>,
        group_id: Option<&str>,
    ) -> Result<(UploadedImage, bool), String> {
        let digest = content_digest(bytes);
        let target_group = group_id.unwrap_or("default");

        if let Some(existing_id) = self.find_image_by_digest(&digest)? {
            let mut store = self.read_metadata();
            let display_name = original_name
                .filter(|n| !n.is_empty() && *n != "blob")
                .map(str::to_string);

            if let Some(meta) = store.image_metadata.iter_mut().find(|m| m.id == existing_id) {
                if let Some(name) = display_name {
                    meta.name = name;
                }
                if group_id.is_some() {
                    meta.group_id = target_group.into();
                }
            } else {
                store.image_metadata.push(ImageMetadata {
                    id: existing_id.clone(),
                    name: display_name.unwrap_or_else(|| existing_id.clone()),
                    group_id: target_group.into(),
                });
            }
            self.write_metadata(&store)?;
            return Ok((self.build_image_record(&existing_id, target_group)?, false));
        }

        let ext = extension_from_bytes(bytes, original_name);
        let filename = format!("{digest}{ext}");
        let path = self.image_path(&filename);

        if !path.exists() {
            fs::write(&path, bytes).map_err(|e| e.to_string())?;
        }

        let mut store = self.read_metadata();
        let display_name = original_name
            .filter(|n| !n.is_empty() && *n != "blob")
            .unwrap_or(&filename)
            .to_string();

        if let Some(meta) = store.image_metadata.iter_mut().find(|m| m.id == filename) {
            meta.name = display_name.clone();
            if group_id.is_some() {
                meta.group_id = target_group.into();
            }
        } else {
            store.image_metadata.push(ImageMetadata {
                id: filename.clone(),
                name: display_name.clone(),
                group_id: target_group.into(),
            });
        }
        self.write_metadata(&store)?;

        Ok((
            self.build_image_record(&filename, target_group)?,
            true,
        ))
    }

    pub fn dedupe_existing_images(&self) -> Result<(), String> {
        let entries = fs::read_dir(&self.root).map_err(|e| e.to_string())?;
        let mut by_digest: HashMap<String, Vec<String>> = HashMap::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !is_image_file(&name) {
                continue;
            }

            let digest = if let Some(existing) = md5_from_filename(&name) {
                existing
            } else if let Ok(bytes) = fs::read(&path) {
                content_digest(&bytes)
            } else {
                continue;
            };

            by_digest.entry(digest).or_default().push(name);
        }

        let mut store = self.read_metadata();
        let mut changed = false;

        for (digest, files) in by_digest {
            if files.len() <= 1 {
                continue;
            }

            let keeper = pick_image_keeper(&files, |name| file_mtime(&self.image_path(name)));
            let ext = Path::new(&keeper)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");
            let canonical = format!("{digest}.{ext}");

            let final_id = if keeper == canonical {
                keeper.clone()
            } else {
                let from = self.image_path(&keeper);
                let to = self.image_path(&canonical);
                if !to.exists() {
                    if fs::rename(&from, &to).is_err() {
                        let _ = fs::copy(&from, &to);
                        let _ = fs::remove_file(&from);
                    }
                } else {
                    let _ = fs::remove_file(&from);
                }

                for meta in store.image_metadata.iter_mut() {
                    if meta.id == keeper {
                        meta.id = canonical.clone();
                    }
                }
                changed = true;
                canonical
            };

            for file in files {
                if file == final_id {
                    continue;
                }
                let path = self.image_path(&file);
                if path.exists() {
                    let _ = fs::remove_file(&path);
                }
                let before = store.image_metadata.len();
                store.image_metadata.retain(|m| m.id != file);
                if store.image_metadata.len() != before {
                    changed = true;
                }
            }
        }

        if changed {
            self.write_metadata(&store)?;
        }

        Ok(())
    }

    fn find_image_by_digest(&self, digest: &str) -> Result<Option<String>, String> {
        let entries = fs::read_dir(&self.root).map_err(|e| e.to_string())?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !is_image_file(&name) {
                continue;
            }

            if let Some(existing) = md5_from_filename(&name) {
                if existing == digest {
                    return Ok(Some(name));
                }
                continue;
            }

            if let Ok(bytes) = fs::read(&path) {
                if content_digest(&bytes) == digest {
                    return Ok(Some(name));
                }
            }
        }

        Ok(None)
    }

    fn build_image_record(&self, id: &str, group_id: &str) -> Result<UploadedImage, String> {
        let store = self.read_metadata();
        let path = self.image_path(id);
        let meta = store
            .image_metadata
            .iter()
            .find(|m| m.id == id)
            .cloned()
            .unwrap_or(ImageMetadata {
                id: id.into(),
                name: id.into(),
                group_id: group_id.into(),
            });

        let created_at = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(now_ms());

        Ok(UploadedImage {
            id: id.into(),
            url: path.to_string_lossy().into_owned(),
            name: meta.name,
            group_id: meta.group_id,
            created_at,
        })
    }

    pub fn delete_image(&self, id: &str) -> Result<(), String> {
        let safe = sanitize_filename(id);
        let path = self.image_path(&safe);
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        let mut store = self.read_metadata();
        store.image_metadata.retain(|m| m.id != safe);
        self.write_metadata(&store)
    }
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    if !path.exists() {
        return Err("missing".into());
    }
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let data = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

fn sanitize_filename(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(name)
        .to_string()
}

fn extension_from_bytes(bytes: &[u8], original_name: Option<&str>) -> String {
    if let Some(name) = original_name {
        if let Some(ext) = Path::new(name).extension().and_then(|e| e.to_str()) {
            return format!(".{ext}");
        }
    }
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        ".png".into()
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        ".jpg".into()
    } else if bytes.starts_with(b"GIF8") {
        ".gif".into()
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        ".webp".into()
    } else {
        ".png".into()
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn content_digest(bytes: &[u8]) -> String {
    format!("{:x}", md5::compute(bytes))
}

fn is_image_file(name: &str) -> bool {
    !name.starts_with('.') && name != TEXTS_FILE && name != METADATA_FILE
}

fn md5_from_filename(name: &str) -> Option<String> {
    let stem = Path::new(name).file_stem()?.to_str()?;
    if stem.len() == 32 && stem.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(stem.to_ascii_lowercase())
    } else {
        None
    }
}

fn file_mtime(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn pick_image_keeper<F>(files: &[String], mtime: F) -> String
where
    F: Fn(&str) -> u64,
{
    files
        .iter()
        .max_by_key(|name| {
            let canonical = md5_from_filename(name).is_some();
            (canonical, mtime(name))
        })
        .cloned()
        .unwrap_or_else(|| files[0].clone())
}
