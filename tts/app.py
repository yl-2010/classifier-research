#!/usr/bin/env python3
"""Local web UI for Orpheus TTS via LM Studio."""

import argparse
import base64
import json
import os
import queue
import threading

from flask import Flask, Response, jsonify, request, send_from_directory

from orpheus_tts import (
    AVAILABLE_VOICES,
    DEFAULT_VOICE,
    check_lm_studio,
    generate_speech_chunks,
    generate_speech_wav,
)
from text_chunking import split_text_for_tts

app = Flask(__name__, static_folder="static")

# How many finished WAV chunks the generator may buffer ahead of the HTTP stream.
GEN_BUFFER_SIZE = int(os.environ.get("TTS_GEN_BUFFER", "12"))


@app.get("/")
def index():
    return send_from_directory("static", "index.html")


@app.get("/api/health")
def health():
    status = check_lm_studio()
    return jsonify(
        {
            "server": "ok",
            "lm_studio": status,
            "voices": AVAILABLE_VOICES,
            "default_voice": DEFAULT_VOICE,
        }
    )


@app.post("/api/synthesize")
def synthesize():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    voice = data.get("voice", DEFAULT_VOICE)

    if not text:
        return jsonify({"error": "Text is required"}), 400
    if voice not in AVAILABLE_VOICES:
        return jsonify({"error": f"Unknown voice: {voice}"}), 400

    try:
        wav_bytes = generate_speech_wav(prompt=text, voice=voice)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return (
        wav_bytes,
        200,
        {
            "Content-Type": "audio/wav",
            "Content-Disposition": "inline; filename=speech.wav",
        },
    )


@app.post("/api/synthesize/stream")
def synthesize_stream():
    """Stream WAV chunks as NDJSON; generation runs in a background thread."""
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    voice = data.get("voice", DEFAULT_VOICE)

    if not text:
        return jsonify({"error": "Text is required"}), 400
    if voice not in AVAILABLE_VOICES:
        return jsonify({"error": f"Unknown voice: {voice}"}), 400

    chunks = split_text_for_tts(text)

    def event_stream():
        chunk_queue: queue.Queue = queue.Queue(maxsize=GEN_BUFFER_SIZE)
        error_box: list[Exception] = []

        def producer():
            try:
                for index, total, chunk_text, wav_bytes in generate_speech_chunks(
                    text, voice=voice
                ):
                    chunk_queue.put(
                        {
                            "type": "chunk",
                            "index": index,
                            "total": total,
                            "text": chunk_text,
                            "audio": base64.b64encode(wav_bytes).decode("ascii"),
                        }
                    )
            except Exception as exc:
                error_box.append(exc)
            finally:
                chunk_queue.put(None)

        thread = threading.Thread(target=producer, daemon=True)
        thread.start()

        yield json.dumps({"type": "start", "total": len(chunks)}) + "\n"

        while True:
            item = chunk_queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"

        thread.join()

        if error_box:
            yield json.dumps({"type": "error", "message": str(error_box[0])}) + "\n"
        else:
            yield json.dumps({"type": "done"}) + "\n"

    return Response(event_stream(), mimetype="application/x-ndjson")


def main():
    parser = argparse.ArgumentParser(description="Orpheus pasted-text-to-speech web UI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5050)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    print(f"Open http://{args.host}:{args.port} in your browser")
    print(f"LM Studio: {os.environ.get('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1234')}")
    print(f"Orpheus model: {os.environ.get('LM_STUDIO_MODEL', 'orpheus-3b-0.1-ft')}")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
