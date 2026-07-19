#!/usr/bin/env python3
"""NoteLMs-style probe: classify a note snippet via LM Studio GPT-OSS (localhost only)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1").rstrip("/")
MODEL = os.environ.get("LM_STUDIO_MODEL", "openai/gpt-oss-20b")

NOTE = sys.argv[1] if len(sys.argv) > 1 else (
    "Photosynthesis converts light energy into chemical energy in chloroplasts; "
    "the light-dependent reactions produce ATP and NADPH."
)

LABELS = (
    "Mathematics, Physics, Chemistry, Biology, Computer Science, "
    "History, Literature, Economics, Other"
)

payload = {
    "model": MODEL,
    "temperature": 0.2,
    "max_tokens": 256,
    "messages": [
        {
            "role": "system",
            "content": (
                "You are NoteLMs' subject classifier. "
                f"Pick exactly one label from: {LABELS}. "
                'Reply with JSON only: {"label":"...","confidence":0-1,"reason":"..."}'
            ),
        },
        {"role": "user", "content": f"Classify this student note:\n\n{NOTE}"},
    ],
}

url = f"{BASE}/chat/completions"
req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

print(f"POST {url}", file=sys.stderr)
print(f"model={MODEL}", file=sys.stderr)

try:
    with urllib.request.urlopen(req, timeout=120) as res:
        data = json.load(res)
except urllib.error.URLError as e:
    print(f"FAILED: cannot reach LM Studio at {BASE}: {e}", file=sys.stderr)
    print(
        "Run this on the Mac Studio with LM Studio local server ON (:1234).",
        file=sys.stderr,
    )
    sys.exit(1)

choice = (data.get("choices") or [{}])[0]
msg = choice.get("message") or {}
text = (msg.get("content") or choice.get("text") or "").strip()
usage = data.get("usage") or {}

print("--- reply ---")
print(text)
print("--- usage ---")
print(json.dumps(usage, indent=2))
