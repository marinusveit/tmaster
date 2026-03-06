#!/bin/bash
# Registriert den tmaster MCP-Server bei Claude Code
# Usage: ./scripts/register-mcp.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_SERVER="$SCRIPT_DIR/../dist/mcp-server/index.js"
ELECTRON_RUNTIME="$SCRIPT_DIR/../node_modules/.bin/electron"

if [ ! -f "$MCP_SERVER" ]; then
  echo "MCP-Server nicht gefunden. Bitte zuerst 'pnpm build:mcp' ausfuehren."
  exit 1
fi

if [ ! -x "$ELECTRON_RUNTIME" ]; then
  echo "Electron-Runtime nicht gefunden. Bitte zuerst 'pnpm install' ausfuehren."
  exit 1
fi

claude mcp add tmaster -- "$ELECTRON_RUNTIME" "$MCP_SERVER"
echo "tmaster MCP-Server registriert."
