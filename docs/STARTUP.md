# NoteLMs everyday startup (Mac Studio)

NoteLMs Express listens on **3002**. Public API: `https://api.notelms.com` via the **NoteLMs** Cloudflare Tunnel (separate from SocketHR).

## After a Mac restart

LaunchAgents auto-start the API + tunnels on login. You only need to start **LM Studio** yourself (GUI):

1. Open **LM Studio**
2. Load models as needed:
   - Notes / classify: `openai/gpt-oss-20b`
   - Voice (`/voice`): `orpheus-3b-0.1-ft` (Orpheus 3B GGUF)
3. Start the local server on port **1234**

Then check:

```bash
curl -sS http://127.0.0.1:3002/health
curl -sS https://api.notelms.com/health
curl -sS http://127.0.0.1:5050/api/health   # Orpheus TTS sidecar
```

### LaunchAgents on this Mac

| Label | What |
|-------|------|
| `com.notelms.server` | NoteLMs Express `:3002` |
| `com.notelms.cloudflared` | NoteLMs tunnel → `api.notelms.com` |
| `com.notelms.tts` | Orpheus TTS sidecar `:5050` (optional; or `npm run tts`) |
| `com.sockethr.server` | SocketHR Express `:3000` |
| `com.sockethr.cloudflared` | SocketHR tunnel → `api.sockethr.com` |

Plists live in `~/Library/LaunchAgents/`. For Voice, install a LaunchAgent that runs `~/github/classifier-research/scripts/start-notelms-tts.sh`, or start it manually with `npm run tts`.

## Manual start (only if LaunchAgents are not installed)

1. **LM Studio (GUI)** — model(s) loaded, local server **ON** `:1234`.

2. **NoteLMs API**

   ```bash
   cd ~/github/classifier-research
   npm run server
   ```

3. **Orpheus TTS sidecar** (needed for `/voice`)

   ```bash
   cd ~/github/classifier-research
   # first time: cd tts && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   npm run tts
   ```

4. **NoteLMs Cloudflare Tunnel**

   ```bash
   cloudflared tunnel --config ~/.cloudflared/config-notelms.yml run
   # or: ./scripts/start-notelms-tunnel.sh
   ```

Auth secret is picked up automatically from `web/.env.local` (from `vercel env pull`) or `server/.auth-secret`. For Google sign-in → USB folder creation, Mac `AUTH_SECRET` must match Vercel `NEXTAUTH_SECRET`.

## Data

User folders live on the Samsung USB volume:

`/Volumes/Samsung USB/notelms/<email>/`

Created automatically on Google sign-in. If `/health` shows `"usbMounted": false`, plug the drive in (the LaunchAgent server will keep running; folder creation works once the volume is mounted).
