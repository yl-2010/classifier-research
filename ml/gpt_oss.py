"""GPT-OSS (LM Studio) classifier client for offline eval."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any

from ml.labels import SUBJECTS

DEFAULT_BASE = os.environ.get("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1").rstrip("/")
DEFAULT_MODEL = os.environ.get("LM_STUDIO_MODEL", "openai/gpt-oss-20b")

_SUBJECT_LOOKUP = {s.lower(): s for s in SUBJECTS}


def extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    # Strip gpt-oss channel wrappers if present
    cleaned = re.sub(r"<\|[^|]+\|>", " ", text)
    cleaned = cleaned.strip()
    try:
        obj = json.loads(cleaned)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            obj = json.loads(cleaned[start : end + 1])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            return None
    return None


def normalize_subject(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    key = raw.strip().lower()
    if key in _SUBJECT_LOOKUP:
        return _SUBJECT_LOOKUP[key]
    # mild aliases
    aliases = {
        "math": "Mathematics",
        "maths": "Mathematics",
        "cs": "Computer Science",
        "comp sci": "Computer Science",
        "computer science": "Computer Science",
        "econ": "Economics",
        "english": "Literature",
        "lit": "Literature",
    }
    if key in aliases:
        return aliases[key]
    return None


class GptOssClassifier:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE,
        model: str = DEFAULT_MODEL,
        timeout: float = 180.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def predict(self, text: str) -> dict[str, Any]:
        system = (
            "You classify student study notes into academic subjects. "
            f"Allowed subjects (pick exactly one): {', '.join(SUBJECTS)}. "
            "Respond with a single JSON object only, no markdown. "
            'Schema: {"subject": string, "confidence": number, "rationale": string} '
            "confidence is 0..1."
        )
        payload = {
            "model": self.model,
            "temperature": 0.1,
            "max_tokens": 256,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Notes:\n{text[:8000]}"},
            ],
        }
        url = f"{self.base_url}/chat/completions"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                data = json.load(res)
        except urllib.error.URLError as exc:
            raise RuntimeError(f"LM Studio unreachable at {self.base_url}: {exc}") from exc

        content = (
            ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        parsed = extract_json_object(content) or {}
        subject = normalize_subject(parsed.get("subject"))
        # Fallbacks: scan for a known subject name in free text
        if subject is None:
            lower = content.lower()
            for s in SUBJECTS:
                if s.lower() in lower:
                    subject = s
                    break
        if subject is None:
            subject = "Mathematics"  # dummy; mark low confidence
            confidence = 0.0
        else:
            confidence = parsed.get("confidence", 0.5)
            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = 0.5
            confidence = max(0.0, min(1.0, confidence))

        return {
            "subject": subject,
            "confidence": confidence,
            "rationale": parsed.get("rationale") if isinstance(parsed.get("rationale"), str) else "",
            "latencyMs": latency_ms,
            "protocol": "gpt_oss_prompted",
            "model": data.get("model") or self.model,
            "raw": content[:500],
        }
