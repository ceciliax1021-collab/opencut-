#!/bin/bash
# 打包源码，方便拖到 GitHub 网页上传（不含 node_modules 等大文件夹）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/release/OpenCut-源码-上传GitHub.zip"
cd "$ROOT"

if [ ! -f ".github/workflows/build.yml" ]; then
  echo "❌ 缺少 .github/workflows/build.yml，GitHub Actions 无法运行 Build OpenCut"
  exit 1
fi

echo "正在打包源码（含 .github 隐藏文件夹）..."
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
echo "⚠️  上传前请确认 zip 解压后能看到 .github/workflows/build.yml"
echo "   Mac 解压后按 Cmd+Shift+. 显示隐藏文件夹"
echo ""
echo "下一步："
echo "1. 打开 https://github.com/new 创建 Public 仓库 opencut"
echo "2. 解压此 zip，把里面所有文件（含 .github）拖进 GitHub 上传"
echo "3. Code 页确认有 .github/workflows/build.yml"
echo "4. Actions → Build OpenCut → Run workflow"
echo "5. 下载 OpenCut-Windows 安装包"
