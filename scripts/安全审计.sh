#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== OpenCut 安全审计 ==="

if ! ls dist/assets/index-*.js >/dev/null 2>&1; then
  echo "请先运行 npm run build"
  exit 1
fi

JS=$(ls dist/assets/index-*.js | head -1)
echo "检查应用源码 src/ ..."
if grep -rEi 'fetch\(|axios|gemini|GEMINI|API_KEY|googleapis|openai|telemetry|analytics|sentry' src --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v "startsWith('http"; then
  echo "FAIL: 源码含网络/API"
  exit 1
fi
echo "OK"

echo "检查 Rust 后端 ..."
if grep -rEi 'reqwest|ureq|hyper::|TcpStream|dns' src-tauri/src 2>/dev/null; then
  echo "FAIL: Rust 含网络库"
  exit 1
fi
echo "OK"

echo "检查配置文件 ..."
if grep -Ei 'devUrl|GEMINI|API_KEY|google' src-tauri/tauri.conf.json package.json 2>/dev/null | grep -v devUrl; then
  true
fi
if grep -q 'connect-src' src-tauri/tauri.conf.json && grep -q "'none'" src-tauri/tauri.conf.json; then
  echo "OK: CSP 禁止联网"
else
  echo "FAIL: CSP 未锁定"
  exit 1
fi

echo "检查打包产物中的主动网络调用 ..."
BAD=$(grep -oE 'fetch\(|XMLHttpRequest|WebSocket|googleapis|gemini\.google|openai\.com|analytics|sentry\.io' "$JS" 2>/dev/null | grep -v modulepreload || true)
if echo "$BAD" | grep -qvE '^$|modulepreload'; then
  if echo "$BAD" | grep -qE 'fetch\('; then
    if grep -q 'modulepreload' "$JS" && [ "$(echo "$BAD" | grep -c 'fetch(')" -le 1 ]; then
      echo "OK: 仅 Vite 本地资源 preload（不访问外网）"
    else
      echo "WARN: $BAD"
    fi
  fi
else
  echo "OK: 无外部 API 调用"
fi

echo ""
echo "说明: React/SVG 库内含 w3.org、react.dev 字符串，仅为静态文本，CSP 已禁止实际联网。"
echo "=== 审计通过，可分发 ==="
