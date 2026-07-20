#!/usr/bin/env bash
# Start the NoteLMs Orpheus TTS sidecar (localhost only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TTS_DIR="$ROOT/tts"
VENV="$TTS_DIR/venv"
HOST="${NOTELMS_TTS_HOST:-127.0.0.1}"
PORT="${NOTELMS_TTS_PORT:-5050}"

export LM_STUDIO_BASE_URL="${LM_STUDIO_BASE_URL:-http://127.0.0.1:1234}"
export LM_STUDIO_MODEL="${LM_STUDIO_MODEL:-orpheus-3b-0.1-ft}"

if [[ ! -d "$VENV" ]]; then
  echo "Missing $VENV — run: cd tts && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
cd "$TTS_DIR"
exec python app.py --host "$HOST" --port "$PORT"
