# NoteLMs Cloudflare Tunnel

NoteLMs uses its **own** Cloudflare account and tunnel (separate from SocketHR).

| Public hostname | Local service | Port | Tunnel |
|-----------------|---------------|------|--------|
| `api.sockethr.com` | SocketHR Express | 3000 | SocketHR account / `~/.cloudflared/config.yml` |
| `api.notelms.com` | NoteLMs Express | **3002** | NoteLMs account / `~/.cloudflared/config-notelms.yml` |

LM Studio (`127.0.0.1:1234`) stays localhost-only — never on either tunnel.

## Live Mac config

```bash
# SocketHR (existing)
cloudflared tunnel --config ~/.cloudflared/config.yml run

# NoteLMs (this product)
cloudflared tunnel --config ~/.cloudflared/config-notelms.yml run
```

Example: [`config.example.yml`](./config.example.yml)

## DNS

`notelms.com` nameservers are on the **NoteLMs Cloudflare account**. Proxied Tunnel / CNAME record:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| Tunnel / CNAME | `api` | `<NOTELMS_TUNNEL_UUID>.cfargotunnel.com` | Proxied |

Do **not** attach `api.notelms.com` as a Vercel project domain.

## Verify

```bash
curl -sS http://127.0.0.1:3002/health
curl -sS https://api.notelms.com/health
```
