# NoteLMs / classifier-research — agent runbook

## Architecture (SocketHR pattern)

```
Browser
├─ https://notelms.com          → Vercel (Next.js in web/)
│     ├─ Auth.js Google OAuth   → /api/auth/[...nextauth]
│     ├─ Mac JWT                → GET /api/mac-token
│     └─ runtime-config.json    → apiBase = https://api.notelms.com
└─ https://api.notelms.com      → Cloudflare Tunnel (shared w/ SocketHR)
      └─ http://127.0.0.1:3002  → Express (server/)
            ├─ filesystem       → /Volumes/Samsung USB/notelms/<email>/
            └─ LM Studio        → http://127.0.0.1:1234/v1  (openai/gpt-oss-20b)
```

## Commands

| Script | Purpose |
|--------|---------|
| `npm run server` | Start Mac Express API (port 3002) |
| `npm run server:dev` | Watch mode |
| `npm run dev` | Next.js UI in `web/` |
| `npm run verify:public-api` | `curl https://api.notelms.com/health` |
| `npm run test:server` | Server unit tests |

## Hard rules

- User notes / profiles stay on the Mac Studio USB path — **not** on Vercel or any cloud DB.
- New Google users → auto-create folder named by **email** under `NOTELMS_DATA_DIR`.
- Do **not** implement BERT routes yet (stubs only).
- Do **not** expose LM Studio publicly.
- Do **not** create a second Cloudflare Tunnel.
- `AUTH_SECRET` (Mac) must equal `NEXTAUTH_SECRET` (Vercel).
- Never commit `server/.env` or USB user data.

## Key docs

- [`SOCKETHR_STACK_REFERENCE.html`](SOCKETHR_STACK_REFERENCE.html)
- [`docs/STARTUP.md`](docs/STARTUP.md)
- [`docs/LOCAL_BACKEND.md`](docs/LOCAL_BACKEND.md)
- [`docs/PUBLIC_TUNNEL.md`](docs/PUBLIC_TUNNEL.md)
- [`AGENT_PLAN.html`](AGENT_PLAN.html)
