use std::fs;
use std::path::{Path, PathBuf};

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
            if name.starts_with('.') || name == TEXTS_FILE || name == METADATA_FILE {
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
    ) -> Result<UploadedImage, String> {
        let digest = format!("{:x}", md5::compute(bytes));
        let ext = extension_from_bytes(bytes, original_name);
        let filename = format!("{digest}{ext}");
        let path = self.image_path(&filename);

        if !path.exists() {
            fs::write(&path, bytes).map_err(|e| e.to_string())?;
        }

        let target_group = group_id.unwrap_or("default");
        let mut store = self.read_metadata();
        let display_name = original_name
            .filter(|n| !n.is_empty() && *n != "blob")
            .unwrap_or(&filename)
            .to_string();

        if let Some(meta) = store.image_metadata.iter_mut().find(|m| m.id == filename) {
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

        let created_at = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(now_ms());

        Ok(UploadedImage {
            id: filename,
            url: path.to_string_lossy().into_owned(),
            name: display_name,
            group_id: target_group.into(),
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
