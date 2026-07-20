# NoteLMs local Mac backend

## What runs where

| Piece | Where | Port |
|-------|--------|------|
| Next.js UI + Auth.js Google | Vercel (`notelms.com`) or `npm run dev` in `web/` | 3000 |
| Express API | Mac Studio (`npm run server`) | **3002** |
| Orpheus TTS sidecar | Mac Studio (`npm run tts`) | **5050** |
| LM Studio (GPT-OSS + Orpheus) | Mac Studio localhost only | **1234** |
| User data | Mac Studio filesystem | `/Volumes/Samsung USB/notelms` |

Vercel never stores notes. The browser gets a short-lived JWT from `GET /api/mac-token` on the website origin, then calls `https://api.notelms.com` with `Authorization: Bearer …`.

## Auth bridge

- Issuer: `notelms-next`
- Audience: `notelms-mac-api`
- Alg: HS256, TTL 10 minutes
- Signing secret: Vercel `NEXTAUTH_SECRET` == Mac `AUTH_SECRET`

On every Google sign-in (new or returning), Vercel calls Mac
`POST /api/ensure-user`. If the email folder is missing it is created; if it
already exists it is reused. The signed-in web app also calls same-origin
`/api/ensure-user` as a backup.

```
/Volumes/Samsung USB/notelms/<user@email.com>/
  profile.json
  subjects.json
  notes/
  research/
```

Folder name is the lowercased Google email (no duplicates across casing).

## API surface (v1)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | no | Public health + LM Studio probe |
| POST | `/api/ensure-user` | yes | Create email folder if missing (sign-in hook) |
| GET | `/api/me` | yes | Ensure user folder; return profile |
| PATCH | `/api/me` | yes | Profile updates |
| GET/POST | `/api/subjects` | yes | Fixed + custom subjects |
| GET/POST | `/api/notes` | yes | List / create |
| GET/PATCH/DELETE | `/api/notes/:id` | yes | CRUD |
| POST | `/api/notes/ingest` | yes | Classify (GPT-OSS) → format → save |
| POST | `/api/classify` | yes | GPT-OSS classify only |
| POST | `/api/format` | yes | GPT-OSS HTML format |
| POST | `/api/chat` | yes | Chat completions via LM Studio |
| GET | `/api/research` | yes | Research event log |
| GET | `/api/voice/health` | yes | Orpheus TTS sidecar + LM Studio probe |
| POST | `/api/voice/synthesize/stream` | yes | NDJSON WAV chunks (ephemeral; not saved) |
| POST | `/api/voice/synthesize` | yes | Single WAV response (ephemeral; not saved) |

Voice is a separate product surface (`/voice`). Pasted text is never written to USB notes/library/research.

**BERT is not wired yet.** Classify/ingest return `bert: { status: "deferred" }` and leave BERT vote fields null.

## LM Studio

```bash
# server/.env
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=openai/gpt-oss-20b
NOTELMS_TTS_URL=http://127.0.0.1:5050
```

The TTS sidecar uses its own Orpheus model id (`LM_STUDIO_MODEL=orpheus-3b-0.1-ft` in the `tts/` process). Confirm ids with `GET /v1/models` after loading in LM Studio. Never put port 1234 or 5050 on the Cloudflare Tunnel — only Express `:3002` via `api.notelms.com`.

## Local dual-process (laptop)

```bash
# terminal A — UI
cd web && npm run dev

# terminal B — API (use a writable data dir)
export NOTELMS_DATA_DIR=/tmp/notelms-dev
export AUTH_SECRET=devsecret
export PORT=3002
npm run server
```

Point the UI at the local API with `NEXT_PUBLIC_NOTELMS_API_BASE=http://127.0.0.1:3002` or a local `runtime-config.json` override. Do not ship localhost `apiBase` to production.
