# NoteLMs Orpheus TTS sidecar

Local Flask service that turns pasted text into speech via the **Orpheus 3B** model in LM Studio (SNAC decode → WAV). Bound to `127.0.0.1:5050` only — the NoteLMs Express API proxies authenticated `/api/voice/*` requests here. LM Studio is never exposed publicly.

## Prerequisites

1. LM Studio with **isaiahbjork/orpheus-3b-0.1-ft-Q4_K_M-GGUF** loaded
2. LM Studio local server on `http://127.0.0.1:1234`
3. Python 3.10+ with a venv

## Setup

```bash
cd tts
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
# from repo root
./scripts/start-notelms-tts.sh
```

Or manually:

```bash
cd tts
source venv/bin/activate
export LM_STUDIO_BASE_URL=http://127.0.0.1:1234
export LM_STUDIO_MODEL=orpheus-3b-0.1-ft
python app.py --host 127.0.0.1 --port 5050
```

Health: `curl -sS http://127.0.0.1:5050/api/health`

## Voices

`dan` (default), `tara`, `leah`, `jess`, `leo`, `mia`, `zac`, `zoe`

Emotion tags in text are supported, e.g. `<laugh>`, `<sigh>`, `<giggle>`.
