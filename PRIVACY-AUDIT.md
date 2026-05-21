# OpenCut 隐私与离线审计报告

> 审计日期：2026-05-21  
> 结论：**纯本地、可断网使用，无 API、无遥测、无 IP 上报**

---

## 1. 网络连接

| 检查项 | 结果 |
|--------|------|
| 前端 `fetch()` / `axios` | ❌ 无 |
| WebSocket | ❌ 无 |
| 第三方 CDN（js/css/font） | ❌ 无 |
| Google / Gemini / OpenAI API | ❌ 无（已删除 metadata.json、.env.example） |
| Rust HTTP 库（reqwest 等） | ❌ 无 |
| 分析 / 遥测 / Sentry | ❌ 无 |

**生产环境 CSP（已启用）：**
```
connect-src 'none'   ← 禁止前端发起任何网络请求
```

**说明：** 开发模式 `npm run dev` 会连接本机 `localhost:1420`，仅用于热更新，打包后不存在。

---

## 2. 数据存储

| 数据 | 位置 | 是否上传 |
|------|------|----------|
| 图片文件 | 本机 clips 目录 | 否 |
| 文本记录 | texts.json | 否 |
| 分类元数据 | image_metadata.json | 否 |

**Mac：** `~/Library/Application Support/com.opencut.desktop/clips/`  
**Windows：** `%APPDATA%\com.opencut.desktop\clips\`

---

## 3. 已删除的云端残留

- `metadata.json`（含 GEMINI API 声明）
- `.env.example`（含 GEMINI_API_KEY、APP_URL）
- `@google/genai` 依赖
- `server.ts` Express 后端
- `tauri-plugin-shell`（可打开任意 URL，已替换为本地路径校验）

---

## 4. 权限最小化

| 权限 | 用途 |
|------|------|
| 剪贴板读写 | 核心功能 |
| 本地文件读写 | 存储 clips |
| 全局快捷键 | 唤起面板 |
| 系统托盘 | 后台常驻 |

**未申请：** 网络、定位、摄像头、麦克风、通讯录

---

## 5. 本地路径安全

- 图片 URL 仅允许 `asset://` 和本地文件路径
- 远程 `http://` / `https://` URL 在前端被拦截
- 「打开图片」命令经 Rust 校验，**只能访问 clips 目录内文件**

---

## 6. 依赖审计（运行时）

```
react / react-dom     UI 渲染
@tauri-apps/api       本地 IPC
arboard (Rust)        系统剪贴板
serde / fs (Rust)     本地 JSON + 文件
```

无 analytics、无 crash reporter、无 update checker（未配置 auto-updater）

---

## 7. 断网验证方法

1. 安装 OpenCut
2. **断开 Wi‑Fi / 拔网线**
3. 复制图片、文字 → 应正常保存
4. 打开面板 → 应正常显示历史记录
5. 复制回剪贴板 → 应正常工作

---

## 8. 不会泄漏的信息

- ❌ IP 地址
- ❌ 设备唯一标识（未主动采集上报）
- ❌ 剪贴板内容到第三方
- ❌ 使用统计 / 崩溃报告

**唯一对外交互：** 用户主动用系统默认程序打开本地图片文件（系统级行为，非 OpenCut 联网）。
