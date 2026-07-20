"""Split long pasted text into TTS-sized chunks (lossless, sentence-aware)."""

import os
import re

DEFAULT_MAX_CHARS = int(os.environ.get("TTS_CHUNK_MAX_CHARS", "320"))
MIN_SENTENCES = int(os.environ.get("TTS_CHUNK_MIN_SENTENCES", "1"))
MAX_SENTENCES = int(os.environ.get("TTS_CHUNK_MAX_SENTENCES", "2"))


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _split_sentences(text: str) -> list[str]:
    """Split on sentence boundaries; keep all text (lossless join with spaces)."""
    parts = re.split(r"(?<=[.!?…])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _hard_split(text: str, max_chars: int) -> list[str]:
    words = text.split()
    chunks: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current)
            if len(word) > max_chars:
                for i in range(0, len(word), max_chars):
                    chunks.append(word[i : i + max_chars])
                current = ""
            else:
                current = word
    if current:
        chunks.append(current)
    return chunks


def _pick_sentence_group(
    sentences: list[str],
    start: int,
    max_chars: int,
    min_sentences: int,
    max_sentences: int,
) -> tuple[list[str], int]:
    """Take up to max_sentences when they fit; fall back to fewer."""
    remaining = len(sentences) - start
    if remaining <= 0:
        return [], start

    for count in (max_sentences, min_sentences, 1):
        if count > remaining:
            continue
        group = sentences[start : start + count]
        joined = " ".join(group)
        if len(joined) <= max_chars:
            return group, start + count

    return [], start


def split_text_for_tts(
    text: str,
    max_chars: int = DEFAULT_MAX_CHARS,
    min_sentences: int = MIN_SENTENCES,
    max_sentences: int = MAX_SENTENCES,
) -> list[str]:
    """
    Pack up to 2 whole sentences per chunk when they fit under max_chars.
    Never splits a sentence unless it alone exceeds max_chars.
    """
    normalized = _normalize(text)
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    sentences = _split_sentences(normalized)
    if len(sentences) <= 1:
        if len(normalized) > max_chars:
            return _hard_split(normalized, max_chars)
        return [normalized]

    chunks: list[str] = []
    index = 0

    while index < len(sentences):
        group, next_index = _pick_sentence_group(
            sentences, index, max_chars, min_sentences, max_sentences
        )

        if group:
            chunks.append(" ".join(group))
            index = next_index
            continue

        sentence = sentences[index]
        if len(sentence) > max_chars:
            chunks.extend(_hard_split(sentence, max_chars))
        else:
            chunks.append(sentence)
        index += 1

    return chunks


def join_chunks(chunks: list[str]) -> str:
    return _normalize(" ".join(chunks))


def is_lossless_split(original: str, chunks: list[str]) -> bool:
    return _normalize(original) == join_chunks(chunks)
