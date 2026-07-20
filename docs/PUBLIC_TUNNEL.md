# NoteLMs public API tunnel

NoteLMs uses a **dedicated** Cloudflare Tunnel in its own Cloudflare account (separate from SocketHR).

## Contract

| Public hostname | Local service | Port | Cloudflare account |
|-----------------|---------------|------|--------------------|
| `api.sockethr.com` | SocketHR Express | 3000 | SocketHR |
| `api.notelms.com` | NoteLMs Express | **3002** | NoteLMs |

## Live Mac config (`~/.cloudflared/config-notelms.yml`)

```yaml
tunnel: <NOTELMS_TUNNEL_UUID>
credentials-file: /Users/<YOU>/.cloudflared/<NOTELMS_TUNNEL_UUID>.json

ingress:
  - hostname: api.notelms.com
    service: http://127.0.0.1:3002
  - service: http_status:404
```

SocketHR keeps `~/.cloudflared/config.yml` with only `api.sockethr.com` → `:3000`.

## DNS

`notelms.com` NS must be on the **NoteLMs Cloudflare account** (same account as the tunnel). Proxied Tunnel/CNAME for `api`:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| Tunnel / CNAME | `api` | `<NOTELMS_TUNNEL_UUID>.cfargotunnel.com` | **Proxied** |

Do **not** attach `api.notelms.com` as a domain on the Vercel project.

## Everyday start

```bash
# Terminal A — NoteLMs Express
npm run server   # :3002

# Terminal B — NoteLMs tunnel
cloudflared tunnel --config ~/.cloudflared/config-notelms.yml run

# (Optional) SocketHR Express + its own tunnel if you need api.sockethr.com
```

## Verify

```bash
curl -sS http://127.0.0.1:3002/health
curl -sS https://api.notelms.com/health
```

- **502** on the public URL with nothing on `:3002` = tunnel + DNS OK, server down.
- LM Studio (`:1234`) must never appear in ingress.
