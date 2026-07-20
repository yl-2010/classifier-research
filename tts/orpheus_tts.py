"""Orpheus TTS client for LM Studio local server."""

import asyncio
import io
import json
import os
import queue
import threading
import time
import wave
from typing import Generator, Iterable, Iterator, Optional

from text_chunking import split_text_for_tts

import requests

LM_STUDIO_BASE = os.environ.get("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234").rstrip("/")
LM_STUDIO_MODEL = os.environ.get("LM_STUDIO_MODEL", "orpheus-3b-0.1-ft")
API_URL = f"{LM_STUDIO_BASE}/v1/completions"
HEADERS = {"Content-Type": "application/json"}

MAX_TOKENS = int(os.environ.get("TTS_MAX_TOKENS", "4096"))
TEMPERATURE = 0.6
TOP_P = 0.9
REPETITION_PENALTY = 1.1
SAMPLE_RATE = 24000

AVAILABLE_VOICES = ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"]
DEFAULT_VOICE = "dan"

CUSTOM_TOKEN_PREFIX = "<custom_token_"


def estimate_max_tokens(text: str) -> int:
    """Scale audio token budget to chunk length (Orpheus streaming heuristic)."""
    # From Orpheus streaming examples: int(len(prompt) * 1.3) * 7 + 21
    needed = int(len(text) * 1.3) * 7 + 21
    floor = int(os.environ.get("TTS_MIN_TOKENS", "400"))
    return max(floor, min(MAX_TOKENS, needed))


def format_prompt(prompt: str, voice: str = DEFAULT_VOICE) -> str:
    if voice not in AVAILABLE_VOICES:
        voice = DEFAULT_VOICE
    formatted_prompt = f"{voice}: {prompt}"
    return f"<|audio|>{formatted_prompt}<|eot_id|>"


def generate_tokens_from_api(
    prompt: str,
    voice: str = DEFAULT_VOICE,
    temperature: float = TEMPERATURE,
    top_p: float = TOP_P,
    max_tokens: int = MAX_TOKENS,
    repetition_penalty: float = REPETITION_PENALTY,
) -> Generator[str, None, None]:
    formatted_prompt = format_prompt(prompt, voice)
    payload = {
        "model": LM_STUDIO_MODEL,
        "prompt": formatted_prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "repeat_penalty": repetition_penalty,
        "stream": True,
    }

    response = requests.post(API_URL, headers=HEADERS, json=payload, stream=True, timeout=300)
    if response.status_code != 200:
        raise RuntimeError(
            f"LM Studio API error {response.status_code}: {response.text}"
        )

    for line in response.iter_lines():
        if not line:
            continue
        line = line.decode("utf-8")
        if not line.startswith("data: "):
            continue
        data_str = line[6:]
        if data_str.strip() == "[DONE]":
            break
        try:
            data = json.loads(data_str)
            if "choices" in data and data["choices"]:
                token_text = data["choices"][0].get("text", "")
                if token_text:
                    yield token_text
        except json.JSONDecodeError:
            continue


def turn_token_into_id(token_string: str, index: int) -> Optional[int]:
    token_string = token_string.strip()
    last_token_start = token_string.rfind(CUSTOM_TOKEN_PREFIX)
    if last_token_start == -1:
        return None

    last_token = token_string[last_token_start:]
    if last_token.startswith(CUSTOM_TOKEN_PREFIX) and last_token.endswith(">"):
        try:
            number_str = last_token[14:-1]
            return int(number_str) - 10 - ((index % 7) * 4096)
        except ValueError:
            return None
    return None


def _convert_to_audio(multiframe, count):
    from decoder import convert_to_audio

    return convert_to_audio(multiframe, count)


async def _tokens_decoder(token_gen):
    buffer = []
    count = 0
    async for token_text in token_gen:
        token = turn_token_into_id(token_text, count)
        if token is not None and token > 0:
            buffer.append(token)
            count += 1
            if count % 7 == 0 and count > 27:
                buffer_to_proc = buffer[-28:]
                audio_samples = _convert_to_audio(buffer_to_proc, count)
                if audio_samples is not None:
                    yield audio_samples


def _collect_audio_segments(token_gen: Iterable[str]) -> list[bytes]:
    audio_queue: queue.Queue[Optional[bytes]] = queue.Queue()
    audio_segments: list[bytes] = []

    async def async_token_gen():
        for token in token_gen:
            yield token

    async def async_producer():
        async for audio_chunk in _tokens_decoder(async_token_gen()):
            audio_queue.put(audio_chunk)
        audio_queue.put(None)

    def run_async():
        asyncio.run(async_producer())

    thread = threading.Thread(target=run_async)
    thread.start()

    while True:
        audio = audio_queue.get()
        if audio is None:
            break
        audio_segments.append(audio)

    thread.join()
    return audio_segments


def segments_to_wav_bytes(segments: list[bytes]) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        for segment in segments:
            wav_file.writeframes(segment)
    return buffer.getvalue()


CHUNK_MAX_ATTEMPTS = int(os.environ.get("TTS_CHUNK_MAX_ATTEMPTS", "3"))
CHUNK_RETRY_DELAY_SEC = float(os.environ.get("TTS_CHUNK_RETRY_DELAY_SEC", "1.5"))


def _synthesize_chunk(
    prompt: str,
    voice: str = DEFAULT_VOICE,
    temperature: float = TEMPERATURE,
    top_p: float = TOP_P,
    max_tokens: Optional[int] = None,
    repetition_penalty: float = REPETITION_PENALTY,
) -> bytes:
    chunk = prompt.strip()
    token_budget = max_tokens if max_tokens is not None else estimate_max_tokens(chunk)
    token_gen = generate_tokens_from_api(
        prompt=chunk,
        voice=voice,
        temperature=temperature,
        top_p=top_p,
        max_tokens=token_budget,
        repetition_penalty=repetition_penalty,
    )
    segments = _collect_audio_segments(token_gen)
    if not segments:
        raise RuntimeError(
            "No audio generated. Is LM Studio running with the Orpheus model loaded?"
        )
    return segments_to_wav_bytes(segments)


def synthesize_chunk_with_retry(
    prompt: str,
    voice: str = DEFAULT_VOICE,
    max_attempts: int = CHUNK_MAX_ATTEMPTS,
) -> bytes:
    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            return _synthesize_chunk(prompt, voice=voice)
        except (RuntimeError, requests.RequestException) as exc:
            last_error = exc
            if attempt < max_attempts:
                time.sleep(CHUNK_RETRY_DELAY_SEC)
    raise RuntimeError(f"Chunk failed after {max_attempts} attempts: {last_error}")


def concat_wav_bytes(wav_list: list[bytes]) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        for wav in wav_list:
            with wave.open(io.BytesIO(wav), "rb") as src:
                out.writeframes(src.readframes(src.getnframes()))
    return buffer.getvalue()


def generate_speech_wav(
    prompt: str,
    voice: str = DEFAULT_VOICE,
    temperature: float = TEMPERATURE,
    top_p: float = TOP_P,
    max_tokens: int = MAX_TOKENS,
    repetition_penalty: float = REPETITION_PENALTY,
) -> bytes:
    if not prompt.strip():
        raise ValueError("Text cannot be empty")

    chunks = split_text_for_tts(prompt)
    if len(chunks) == 1:
        return _synthesize_chunk(
            prompt,
            voice=voice,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            repetition_penalty=repetition_penalty,
        )

    wav_parts: list[bytes] = []
    for chunk in chunks:
        wav_parts.append(synthesize_chunk_with_retry(chunk, voice=voice))
    return concat_wav_bytes(wav_parts)


def generate_speech_chunks(
    prompt: str,
    voice: str = DEFAULT_VOICE,
) -> Iterator[tuple[int, int, str, bytes]]:
    """Yield (index, total, chunk_text, wav_bytes) for streaming playback."""
    if not prompt.strip():
        raise ValueError("Text cannot be empty")

    chunks = split_text_for_tts(prompt)
    total = len(chunks)
    for index, chunk in enumerate(chunks):
        wav = synthesize_chunk_with_retry(chunk, voice=voice)
        yield index, total, chunk, wav


def check_lm_studio() -> dict:
    try:
        response = requests.get(f"{LM_STUDIO_BASE}/v1/models", timeout=5)
        if response.status_code == 200:
            return {"ok": True, "models": response.json()}
        return {"ok": False, "error": f"Server returned {response.status_code}"}
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc)}
