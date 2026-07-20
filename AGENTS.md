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
