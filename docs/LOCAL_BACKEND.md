# NoteLMs local Mac backend

## What runs where

| Piece | Where | Port |
|-------|--------|------|
| Next.js UI + Auth.js Google | Vercel (`notelms.com`) or `npm run dev` in `web/` | 3000 |
| Express API | Mac Studio (`npm run server`) | **3002** |
| LM Studio GPT-OSS | Mac Studio localhost only | **1234** |
| User data | Mac Studio filesystem | `/Volumes/Samsung USB/notelms` |

Vercel never stores notes. The browser gets a short-lived JWT from `GET /api/mac-token` on the website origin, then calls `https://api.notelms.com` with `Authorization: Bearer …`.

## Auth bridge

- Issuer: `notelms-next`
- Audience: `notelms-mac-api`
- Alg: HS256, TTL 10 minutes
- Signing secret: Vercel `NEXTAUTH_SECRET` == Mac `AUTH_SECRET`

On first authenticated API call, Express creates:

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

**BERT is not wired yet.** Classify/ingest return `bert: { status: "deferred" }` and leave BERT vote fields null.

## LM Studio

```bash
# server/.env
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=openai/gpt-oss-20b
```

Confirm the exact model id with `GET /v1/models` after loading in LM Studio. Never put port 1234 on the Cloudflare Tunnel.

## Local dual-process (laptop)

```bash
# terminal A — UI
cd web && npm run dev

# terminal B — API (use a writable data dir)
NOTELMS_DATA_DIR=/tmp/notelms-dev AUTH_SECRET=devsecret \
  PORT=3002 npm run server
```

Point the UI at the local API with `NEXT_PUBLIC_NOTELMS_API_BASE=http://127.0.0.1:3002` or a local `runtime-config.json` override. Do not ship localhost `apiBase` to production.
