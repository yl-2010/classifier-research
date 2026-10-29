# NoteLMs everyday startup (Mac Studio)

NoteLMs Express listens on **3002**. Public API: `https://api.notelms.com` via the **NoteLMs** Cloudflare Tunnel (separate from SocketHR).

## After a Mac restart

LaunchAgents auto-start the API, tunnel, and Orpheus TTS sidecar on login. `com.yanylevin.lmstudio-gpt-oss` (in the yanylevin repo) opens LM Studio and loads `openai/gpt-oss-20b` with no idle timeout. Voice does not need a manual load. The sidecar on `:5050` loads `orpheus-3b-0.1-ft` for a request, at context 8192, and LM Studio drops it after 180 seconds idle.

Then check:

```bash
curl -sS http://127.0.0.1:3002/health
curl -sS https://api.notelms.com/health
curl -sS http://127.0.0.1:3003/health   # BERT zero-shot + fine-tuned
curl -sS http://127.0.0.1:5050/api/health   # Orpheus TTS sidecar
```

### LaunchAgents on this Mac

| Label | What |
|-------|------|
| `com.notelms.server` | NoteLMs Express `:3002` |
| `com.notelms.cloudflared` | NoteLMs tunnel → `api.notelms.com` |
| `com.notelms.tts` | Orpheus TTS sidecar `:5050` |
| `com.sockethr.server` | SocketHR Express `:3000` |
| `com.sockethr.cloudflared` | SocketHR tunnel → `api.sockethr.com` |

Plists live in `~/Library/LaunchAgents/`. TTS runs `scripts/start-notelms-tts.sh` (`KeepAlive` + `RunAtLoad`); logs: `/tmp/notelms-tts.log` / `/tmp/notelms-tts.err`. BERT is started manually with `npm run bert:serve` (or add a LaunchAgent later).

## Manual start (only if LaunchAgents are not installed)

1. **LM Studio** — `com.yanylevin.lmstudio-gpt-oss` opens the app, starts the server on `:1234`, and loads `openai/gpt-oss-20b`. Orpheus loads itself when `/voice` is used.

2. **NoteLMs API**

   ```bash
   cd ~/github/classifier-research
   npm run server
   ```

3. **BERT service** (needed for zero-shot + fine-tuned votes)

   ```bash
   cd ~/github/classifier-research
   # first time: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   # train once: npm run bert:train
   npm run bert:serve
   ```

4. **Orpheus TTS sidecar** (needed for `/voice`)

   ```bash
   cd ~/github/classifier-research
   # first time: cd tts && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   npm run tts
   ```

5. **NoteLMs Cloudflare Tunnel**

   ```bash
   cloudflared tunnel --config ~/.cloudflared/config-notelms.yml run
   # or: ./scripts/start-notelms-tunnel.sh
   ```

Auth secret is picked up automatically from `web/.env.local` (from `vercel env pull`) or `server/.auth-secret`. For Google sign-in → USB folder creation, Mac `AUTH_SECRET` must match Vercel `NEXTAUTH_SECRET`.

## Data

User folders live on the Samsung USB volume:

`/Volumes/Samsung USB/notelms/<email>/`

Created automatically on Google sign-in. If `/health` shows `"usbMounted": false`, plug the drive in (the LaunchAgent server will keep running; folder creation works once the volume is mounted).
