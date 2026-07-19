# NoteLMs everyday startup (Mac Studio)

NoteLMs Express listens on **3002** (shared Cloudflare Tunnel → `api.notelms.com`).

## Order

1. **LM Studio (GUI)** — load `openai/gpt-oss-20b`, start local server on port **1234**.

2. **NoteLMs API**

   ```bash
   cd ~/github/classifier-research
   git pull
   npm install --prefix server
   npm run server
   ```

   No `.env` editing. Defaults are built in (port 3002, USB data dir, GPT-OSS).
   Auth secret is picked up automatically from `web/.env.local` if present, otherwise generated once into `server/.auth-secret`.

   Check:

   ```bash
   curl -s http://127.0.0.1:3002/health
   ```

3. **Shared Cloudflare Tunnel** (same process as SocketHR)

   ```bash
   cloudflared tunnel --config ~/.cloudflared/config.yml run
   ```

## Data

User folders live on the Samsung USB volume (auto-discovered under `/Volumes`, same idea as SocketHR’s `SOCKETHR_DATA_DIR`):

`/Volumes/Samsung USB/notelms/<email>/`

Created automatically on Google sign-in. If `/health` shows `"usbMounted": false`, plug the drive in and restart `npm run server`.
