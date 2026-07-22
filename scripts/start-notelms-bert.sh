#!/usr/bin/env bash
# Start the NoteLMs BERT sidecar (localhost only: zero-shot + fine-tuned).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PYTHON="$VENV/bin/python"
SCRIPT="$ROOT/scripts/bert_serve.py"
HOST="${BERT_HOST:-127.0.0.1}"
PORT="${BERT_PORT:-3003}"

if [[ ! -x "$PYTHON" ]]; then
  echo "Missing $PYTHON — run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

if [[ ! -f "$SCRIPT" ]]; then
  echo "Missing $SCRIPT" >&2
  exit 1
fi

export BERT_HOST="$HOST"
export BERT_PORT="$PORT"
cd "$ROOT"
exec "$PYTHON" "$SCRIPT"
