# NoteLMs / classifier-research — agent runbook

## Architecture (SocketHR pattern)

```
Browser
├─ https://notelms.com          → Vercel (Next.js in web/)
│     ├─ Auth.js Google OAuth   → /api/auth/[...nextauth]
│     ├─ Mac JWT                → GET /api/mac-token
│     └─ runtime-config.json    → apiBase = https://api.notelms.com
└─ https://api.notelms.com      → NoteLMs Cloudflare Tunnel (own account)
      └─ http://127.0.0.1:3002  → Express (server/)
            ├─ filesystem       → /Volumes/Samsung USB/notelms/<email>/
            ├─ LM Studio        → http://127.0.0.1:1234/v1  (openai/gpt-oss-20b)
            └─ BERT service     → http://127.0.0.1:3003     (zero-shot + fine-tuned)

SocketHR uses a separate tunnel/process: api.sockethr.com → :3000
```

## Commands

| Script | Purpose |
|--------|---------|
| `npm run server` | Start Mac Express API (port 3002) |
| `npm run server:dev` | Watch mode |
| `npm run bert:serve` | Local BERT inference (port 3003; needs `.venv`) |
| `npm run bert:train` | Fine-tune BERT → `models/fine-tuned-bert/` |
| `npm run bert:eval` | Frozen-test metrics → `data/processed/bert_eval.json` |
| `npm run dev` | Next.js UI in `web/` |
| `npm run verify:public-api` | `curl https://api.notelms.com/health` |
| `npm run test:server` | Server unit tests |

## Hard rules

- User notes / profiles stay on the Mac Studio USB path — **not** on Vercel or any cloud DB.
- New Google users → auto-create folder named by **email** under `NOTELMS_DATA_DIR`.
- Do **not** expose LM Studio or the BERT service publicly (localhost only; never Cloudflare Tunnel).
- NoteLMs and SocketHR each own a Cloudflare Tunnel (two `cloudflared` processes on the Mac). Do **not** merge them back into one shared tunnel without an explicit decision.
- Auth secret is auto-loaded (`web/.env.local` or `server/.auth-secret`); for production JWT bridge it must match Vercel `NEXTAUTH_SECRET`.
- Never commit `server/.env`, `server/.auth-secret`, USB user data, or `models/` weight checkpoints.
- Do not ask the human to hand-edit `.env` for everyday startup.

## Key docs

- [`agent-plans/`](agent-plans/) — all agent HTML plans
- [`agent-plans/SOCKETHR_STACK_REFERENCE.html`](agent-plans/SOCKETHR_STACK_REFERENCE.html)
- [`agent-plans/NOTELMS_API_TUNNEL_DNS_FIX.html`](agent-plans/NOTELMS_API_TUNNEL_DNS_FIX.html) — fix `api.notelms.com` DNS/tunnel
- [`docs/STARTUP.md`](docs/STARTUP.md)
- [`docs/LOCAL_BACKEND.md`](docs/LOCAL_BACKEND.md)
- [`docs/PUBLIC_TUNNEL.md`](docs/PUBLIC_TUNNEL.md)
- [`agent-plans/AGENT_PLAN.html`](agent-plans/AGENT_PLAN.html)

## Cursor Cloud specific instructions

Runnable in this Linux cloud VM (dev deps auto-installed on startup): the **Next.js UI** (`web/`) and the **Express API** (`server/`). The rest of the stack is **not** runnable here and does not block dev/test:

- **LM Studio** (`:1234`, GPT-OSS/Orpheus), **BERT service** (`:3003`), **Orpheus TTS** (`:5050`) — need a GPU / large local models (and are macOS-oriented). The Python `.venv` + `requirements.txt` (torch/transformers) research pipeline is intentionally left out of the update script.
- **Cloudflare Tunnel** and the `/Volumes/Samsung USB` data path are Mac/production only.

The Express API **degrades gracefully**: with LM Studio/BERT/OCR down, `GET /health` still returns `ok:true` and all filesystem endpoints (`/api/ensure-user`, `/api/me`, `/api/subjects`, `/api/notes`) work. Only `/api/classify`, `/api/notes/ingest`, `/api/format`, `/api/chat`, and `/api/voice/*` require those extra services.

Local two-process dev (see also `docs/LOCAL_BACKEND.md` "Local multi-process"):
- API: `NOTELMS_DATA_DIR=/tmp/notelms-dev AUTH_SECRET=<16+ chars> PORT=3002 npm run server` (set `NOTELMS_DATA_DIR` to a writable dir since the USB volume is absent; `AUTH_SECRET` must be ≥16 chars or `load-env.js` generates a random one).
- UI: `NEXT_PUBLIC_NOTELMS_API_BASE=http://127.0.0.1:3002 npm run dev` (otherwise the UI targets the prod `apiBase` in `web/public/runtime-config.json`).
- Auth is a Google-OAuth → HS256 JWT bridge; without Google creds you can't sign in via the browser, but you can mint a bridge JWT directly (issuer `notelms-next`, audience `notelms-mac-api`, `email` claim) with the same `AUTH_SECRET` to exercise the API end-to-end.

Gotcha: `next dev` and `next build` share `web/.next`. Running `npm run build` while `npm run dev` is live clobbers the dev chunks and causes `Cannot find module './###.js'` runtime errors in the browser. Fix by stopping dev, `rm -rf web/.next`, and restarting `npm run dev`.

No linter is configured (no ESLint config; `web` has no `lint` script). Tests: `npm run test:server` (Node built-in test runner). Build check: `npm run build`.
