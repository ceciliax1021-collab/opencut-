#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 1/3 检查 Mac 安装包..."
if [ ! -f "release/OpenCut-macOS.dmg" ]; then
  echo "正在打包 Mac 版..."
  npm run build
  mkdir -p release
  cp src-tauri/target/release/bundle/dmg/*.dmg release/OpenCut-macOS.dmg
fi
echo "    Mac 安装包: release/OpenCut-macOS.dmg"

echo "==> 2/3 准备 Git 仓库..."
if [ ! -d .git ]; then
  git init
  git branch -M main
fi

echo "==> 3/3 创建分发压缩包..."
mkdir -p release
zip -j -q release/OpenCut-分发包-Mac版.zip \
  release/OpenCut-macOS.dmg \
  release/安装说明.txt \
  release/数据与更新说明.txt

echo ""
echo "✅ 完成！你可以直接发给 Mac 用户："
echo "   $ROOT/release/OpenCut-分发包-Mac版.zip"
echo ""
echo "Windows 版请看: release/Windows安装包获取方式.txt"
echo "或运行 GitHub 自动打包（需 GitHub 账号）"
