#!/bin/bash
# 打包源码，方便拖到 GitHub 网页上传（不含 node_modules 等大文件夹）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/release/OpenCut-源码-上传GitHub.zip"
cd "$ROOT"

echo "正在打包源码..."
zip -r -q "$OUT" . \
  -x "node_modules/*" \
  -x "src-tauri/target/*" \
  -x "src-tauri/gen/*" \
  -x "dist/*" \
  -x "uploads/*" \
  -x ".git/*" \
  -x "release/*" \
  -x "*.log" \
  -x ".DS_Store" \
  -x ".env*"

echo "✅ 源码包已生成:"
echo "   $OUT"
echo ""
echo "下一步："
echo "1. 打开 https://github.com/new 创建仓库 opencut"
echo "2. 点 uploading an existing file"
echo "3. 解压此 zip，把里面的文件全部拖进 GitHub 上传"
echo "4. Actions → Build OpenCut → Run workflow"
echo "5. 下载 OpenCut-Windows 安装包"
