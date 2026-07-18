# Cloudflare Tunnel (shared with SocketHR)

NoteLMs does **not** own a separate tunnel. It adds a second ingress hostname on the existing SocketHR `cloudflared` process.

See:

- [`docs/PUBLIC_TUNNEL.md`](../../docs/PUBLIC_TUNNEL.md)
- [`SHARED_CLOUDFLARE_TUNNEL_PLAN.html`](../../SHARED_CLOUDFLARE_TUNNEL_PLAN.html)
- [`config.example.yml`](./config.example.yml)

Everyday start:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run
```

One command serves both `api.sockethr.com` and `api.notelms.com`.
