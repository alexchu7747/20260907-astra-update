#!/bin/zsh
cd "$(dirname "$0")"

NODE="/Users/chu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ ! -x "$NODE" ]; then
  NODE="$(command -v node)"
fi

if [ -z "$NODE" ]; then
  echo "没有找到 Node.js。请在 Codex 里打开这个工具，或安装 Node.js。"
  read "?按回车退出"
  exit 1
fi

open "http://127.0.0.1:4173/"
"$NODE" server.js
