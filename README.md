<div align="center">

# OpenCut

轻量本地剪贴板管理器 — 图片 + 文本，Mac / Windows 双平台

</div>

## 功能

- 后台自动监听系统剪贴板（图片 / 文本）
- 图片分类管理、批量操作、一键复制
- 文本剪贴记录、置顶、编辑、导出
- 托盘 / 菜单栏常驻，关闭窗口不退出
- 全局快捷键唤起面板
- **Mac**：Menu Bar 模式，无 Dock 图标（类似 Paste）
- **Windows**：系统托盘模式，无任务栏图标

## 技术栈

- **前端**：React 19 + Tailwind CSS + Motion
- **后端**：Rust + Tauri 2（极低内存占用）
- **存储**：完全本地，断网可用，无 API、无遥测

## 开发

**前置条件**：Node.js 18+、Rust（[rustup](https://rustup.rs/)）

```bash
npm install
npm run dev          # 启动 Tauri 开发模式
```

## 打包

```bash
npm run build
```

| 平台 | 当前机器可打 | 产物 |
|------|-------------|------|
| macOS | 在 Mac 上执行 | `src-tauri/target/release/bundle/dmg/*.dmg` |
| Windows | 在 Windows 上执行 | `src-tauri/target/release/bundle/nsis/*-setup.exe` |

> Mac 无法直接交叉编译 Windows 安装包。推荐用 GitHub Actions 一键双平台打包（见下方）。

### GitHub Actions 自动打包（推荐分发）

1. 把代码推到 GitHub
2. 打开 **Actions → Build OpenCut → Run workflow**
3. 完成后在 Artifacts 下载：
   - `OpenCut-macOS` → `.dmg`
   - `OpenCut-Windows` → `-setup.exe`

也可以打 tag（如 `v0.1.0`）推送后自动触发构建。

Release 构建已启用 `opt-level = "z"` + LTO + strip，目标常驻内存 **~15–30 MB**。

## 隐私与离线

OpenCut **100% 本地运行**，可完全断网使用。详见 [PRIVACY-AUDIT.md](./PRIVACY-AUDIT.md)。

- 无 API 调用、无云同步、无 IP 上报
- CSP 禁止前端网络请求（`connect-src 'none'`）
- 已移除所有 AI Studio / Gemini 相关残留

## 数据目录

**macOS**

```
~/Library/Application Support/com.opencut.desktop/clips/
```

**Windows**

```
%APPDATA%\com.opencut.desktop\clips\
```

目录结构：

```
clips/
├── *.png / *.jpg
├── texts.json
└── image_metadata.json
```

## 快捷键

| 平台 | 唤起面板 | 托盘 / 菜单栏 |
|------|----------|---------------|
| macOS | `⌘⇧V` | 点击菜单栏图标 |
| Windows | `Ctrl+Shift+V` | 左键点击托盘图标 |

通用（面板内）：

| 快捷键 | 功能 |
|--------|------|
| `⌘V` / `Ctrl+V` | 粘贴导入图片或文本 |
| `⌘A` / `Ctrl+A` | 全选 |
| `⌘C` / `Ctrl+C` | 复制选中项 |
| `Delete` | 删除选中项 |
| 点击面板外 | 自动隐藏面板 |

## 分发给他人

- **Mac 用户**：发送 `.dmg`，双击拖入 Applications 即可
- **Windows 用户**：发送 `OpenCut_*-setup.exe`，双击安装（当前用户，无需管理员）

首次运行后图标出现在菜单栏 / 托盘，复制任意内容会自动记录。
