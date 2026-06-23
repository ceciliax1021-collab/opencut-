# OpenCut

本地剪贴板管理器，支持图片和文本。Mac / Windows 可用。

## 使用

- 安装后图标在菜单栏（Mac）或托盘（Windows）
- 复制的内容会自动保存
- 点击菜单栏 / 托盘图标，或 **Mac 程序坞图标** 打开面板
- 面板内按 `⌘R` / `Ctrl+R` 刷新列表

## 数据位置

- Mac：`~/Library/Application Support/com.opencut.desktop/clips/`
- Windows：`%APPDATA%\com.opencut.desktop\clips\`

更新或重装不会删除上述文件夹里的数据。

## 开发打包

```bash
npm install
npm run dev      # 开发
npm run build    # 打包
```

Windows 安装包可通过 GitHub Actions（`.github/workflows/build.yml`）在云端构建。
