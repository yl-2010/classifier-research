# NoteLMs everyday startup (Mac Studio)

Mirror of SocketHR’s three-process home-lab pattern. NoteLMs Express listens on **3002** so it can share SocketHR’s Cloudflare Tunnel (`api.notelms.com`).

## Order

1. **LM Studio (GUI)**  
   Load `openai/gpt-oss-20b` → Developer → local server **ON** (port **1234**).  
   Confirm:

   ```bash
   curl -s http://127.0.0.1:1234/v1/models
   ```

2. **NoteLMs Express API** (first time)

   ```bash
   cd ~/github/classifier-research
   npm install --prefix server
   npm run server
   ```

   On first run, `server/.env` is created automatically from `server/.env.example`.
   Stop the server, edit `server/.env`, and set:

   ```bash
   AUTH_SECRET=<same value as Vercel NEXTAUTH_SECRET>
   ```

   Then start again:

   ```bash
   npm run server
   ```

   Confirm:

   ```bash
   curl -s http://127.0.0.1:3002/health
   ```

   Expect JSON with `"service":"notelms-server"`.

3. **Shared Cloudflare Tunnel** (one process for SocketHR + NoteLMs)

   ```bash
   cloudflared tunnel --config ~/.cloudflared/config.yml run
   ```

   Confirm from anywhere:

   ```bash
   curl -sS https://api.notelms.com/health
   ```

## Data

All user notes / profiles live on the Mac Studio USB path:

`/Volumes/Samsung USB/notelms/<email>/`

Override with `NOTELMS_DATA_DIR` in `server/.env` if needed. Ensure the USB volume is mounted before starting the server.

## Secrets

`server/.env` → `AUTH_SECRET` must equal Vercel `NEXTAUTH_SECRET`.
