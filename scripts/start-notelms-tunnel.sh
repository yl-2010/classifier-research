#!/usr/bin/env bash
# Start the NoteLMs Cloudflare Tunnel (separate from SocketHR).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
CONFIG="${HOME}/.cloudflared/config-notelms.yml"
if [[ ! -f "$CONFIG" ]]; then
  echo "Missing $CONFIG — copy deploy/cloudflared/config.example.yml and fill the tunnel UUID." >&2
  exit 1
fi
exec cloudflared tunnel --config "$CONFIG" run
