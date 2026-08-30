#!/bin/zsh
set -e
cd "$(dirname "$0")/app"
if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请先安装 Node.js 22.13 或更高版本。"
  read "?按回车键退出……"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "未找到 pnpm，正在通过 Corepack启用……"
  corepack enable
fi
if [ ! -d node_modules ]; then
  pnpm install
fi
./node_modules/.bin/vinext dev
