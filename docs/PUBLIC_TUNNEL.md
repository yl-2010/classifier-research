# NoteLMs public API tunnel

NoteLMs **shares** SocketHR’s existing Cloudflare Tunnel. Do **not** create a second tunnel.

## Contract

| Public hostname | Local service | Port |
|-----------------|---------------|------|
| `api.sockethr.com` | SocketHR Express | 3000 |
| `api.notelms.com` | NoteLMs Express | **3002** |

## Live Mac config (`~/.cloudflared/config.yml`)

```yaml
tunnel: <EXISTING_TUNNEL_UUID>
credentials-file: /Users/<YOU>/.cloudflared/<EXISTING_TUNNEL_UUID>.json

ingress:
  - hostname: api.sockethr.com
    service: http://127.0.0.1:3000
  - hostname: api.notelms.com
    service: http://127.0.0.1:3002
  - service: http_status:404
```

## DNS (Vercel, Path A)

For domain `notelms.com`, add a **DNS-only** CNAME (not a Vercel project domain):

| Type | Name | Value |
|------|------|-------|
| CNAME | `api` | `<SAME_TUNNEL_UUID>.cfargotunnel.com` |

Do **not** attach `api.notelms.com` as a domain on the Vercel project (that yields `DEPLOYMENT_NOT_FOUND`).

## Verify

```bash
curl -sS http://127.0.0.1:3002/health
curl -sS https://api.notelms.com/health
```

- **502** on the public URL with nothing listening on :3002 = tunnel + DNS OK, server down.
- LM Studio (`:1234`) must never appear in ingress.
