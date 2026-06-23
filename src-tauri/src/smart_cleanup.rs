use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub pattern: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartCleanupConfig {
    pub rules: Vec<CleanupRule>,
    pub excluded_content: Vec<String>,
    pub deleted_content_history: Vec<String>,
}

impl SmartCleanupConfig {
    pub fn load(path: &PathBuf) -> Self {
        if path.exists() {
            fs::read_to_string(path)
                .ok()
                .and_then(|data| serde_json::from_str(&data).ok())
                .unwrap_or_else(Self::default)
        } else {
            Self::default()
        }
    }

    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        let data = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())
    }

    pub fn default() -> Self {
        Self {
            rules: vec![
                CleanupRule {
                    id: "hex_color".into(),
                    name: "色值（如 #FF0000）".into(),
                    enabled: true,
                    pattern: "^#[0-9a-fA-F]{3,8}$".into(),
                    description: "匹配十六进制颜色代码".into(),
                },
                CleanupRule {
                    id: "pure_number".into(),
                    name: "纯数字（5字内）".into(),
                    enabled: true,
                    pattern: "^\\d{1,5}$".into(),
                    description: "匹配5位以内的纯数字".into(),
                },
                CleanupRule {
                    id: "pure_english".into(),
                    name: "纯英文内容".into(),
                    enabled: true,
                    pattern: "^[a-zA-Z]+$".into(),
                    description: "匹配纯英文字母内容".into(),
                },
                CleanupRule {
                    id: "random_alphanumeric".into(),
                    name: "随机字母数字组合".into(),
                    enabled: true,
                    pattern: "^[a-zA-Z0-9]{6,20}$".into(),
                    description: "匹配6-20位的字母数字组合".into(),
                },
                CleanupRule {
                    id: "single_char".into(),
                    name: "单个字符".into(),
                    enabled: true,
                    pattern: "^.$".into(),
                    description: "匹配任意单个字符".into(),
                },
                CleanupRule {
                    id: "url".into(),
                    name: "网址链接".into(),
                    enabled: true,
                    pattern: "^(https?://|www\\.)[^\\s]+$".into(),
                    description: "匹配网址链接".into(),
                },
            ],
            excluded_content: vec![],
            deleted_content_history: vec![],
        }
    }

    pub fn matches_any_rule(&self, content: &str) -> Vec<String> {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return vec![];
        }

        // Check if content is in excluded list
        if self.excluded_content.contains(&trimmed.to_string()) {
            return vec![];
        }

        self.rules
            .iter()
            .filter(|r| r.enabled)
            .filter(|r| {
                regex::Regex::new(&r.pattern)
                    .map(|re| re.is_match(trimmed))
                    .unwrap_or(false)
            })
            .map(|r| r.id.clone())
            .collect()
    }
}