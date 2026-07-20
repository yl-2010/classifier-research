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

## DNS (Cloudflare-proxied — required)

A bare CNAME on Vercel DNS to `*.cfargotunnel.com` is **not enough**. Cloudflare Tunnel only publishes public edge IPs when `api.notelms.com` is a **proxied** record in the **same Cloudflare account** as the tunnel (same pattern as live `api.sockethr.com` / `sockethr.com` on Cloudflare NS).

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| CNAME | `api` | `<SAME_TUNNEL_UUID>.cfargotunnel.com` | **Proxied (orange cloud)** |

Do **not** attach `api.notelms.com` as a domain on the Vercel project (that yields `DEPLOYMENT_NOT_FOUND`).

If HTTPS to `api.notelms.com` fails with no public A records, follow [`agent-plans/NOTELMS_API_TUNNEL_DNS_FIX.html`](../agent-plans/NOTELMS_API_TUNNEL_DNS_FIX.html).

## Verify

```bash
curl -sS http://127.0.0.1:3002/health
curl -sS https://api.notelms.com/health
```

- **502** on the public URL with nothing listening on :3002 = tunnel + DNS OK, server down.
- LM Studio (`:1234`) must never appear in ingress.
