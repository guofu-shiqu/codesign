#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$PWD"
PORT="${CODESIGN_PORT:-43217}"
PROJECT_DIR="${CODESIGN_PROJECT_DIR:-${1:-$CALLER_DIR}}"
CANVAS_DIR="${CODESIGN_CANVAS_DIR:-$PROJECT_DIR/canvas}"

export CODESIGN_PROJECT_DIR="$PROJECT_DIR"
export CODESIGN_CANVAS_DIR="$CANVAS_DIR"

cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

echo "Code Design service: http://127.0.0.1:${PORT}"
echo "Code Design canvas data: ${CANVAS_DIR}/pages/<page-id>/codesign-canvas.json"
echo "Code Design page assets: ${CANVAS_DIR}/pages/<page-id>/assets -> http://127.0.0.1:${PORT}/page-assets/<page-id>/"
exec npm run dev -- --host 127.0.0.1 --port "$PORT"
