# Cloudflare Zero Trust Tunnel Setup

## How traffic flows

Canonical assumptions for this repo:
- Public hostname: `nexus.garfield-math.xyz`
- Public app: Nexus only (port `37291`)
- Internal-only app: Wisp only (port `37292`)
- Browser transport URL: `wss://nexus.garfield-math.xyz/wisp/`
- Nexus internal upstream: `ws://<internal-host>:37292`

```
User's browser
  └─► Cloudflare edge (TLS terminated here, wss:// → ws://)
        └─► cloudflared daemon (on your server, inside the tunnel)
              └─► nexus container on 127.0.0.1:37291
                    ├─► /bare/*        Bare server relay (UV/Scramjet HTTP proxy)
                    ├─► /service/*     UV service worker assets
                    ├─► /scram/*       Scramjet service worker assets
                    ├─► /api/*         Metrics, config, SSE stream
                    └─► /wisp/*        WebSocket → proxied to wisp:37292 (Docker internal)
                                             └─► Raw TCP to target website
```

## Step-by-step

### 1. Install cloudflared on your server

```bash
# Debian/Ubuntu
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | \
  gpg --dearmor > /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
  https://pkg.cloudflare.com/cloudflared any main" \
  > /etc/apt/sources.list.d/cloudflared.list
apt update && apt install cloudflared
```

### 2. Authenticate and create the tunnel

```bash
cloudflared tunnel login           # opens browser, pick your zone
cloudflared tunnel create nexus-proxy
# Prints: Created tunnel nexus-proxy with id <UUID>
# Credential file saved to ~/.cloudflared/<UUID>.json
```

### 3. Configure the tunnel

```bash
# Edit tunnel-config.yml — replace placeholders:
#   <TUNNEL_UUID>       → the UUID from step 2
#   nexus.garfield-math.xyz → required public Nexus hostname

cp cloudflare/tunnel-config.yml ~/.cloudflared/config.yml
nano ~/.cloudflared/config.yml
```

### 4. Add a DNS record

```bash
# This creates a CNAME record: nexus.garfield-math.xyz → <UUID>.cfargotunnel.com
cloudflared tunnel route dns nexus-proxy nexus.garfield-math.xyz
```

### 5. Set PUBLIC_WISP_URL in Coolify

In Coolify → your project → Environment Variables, set:

```
PUBLIC_WISP_URL = wss://nexus.garfield-math.xyz/wisp/
CORS_ORIGIN     = https://nexus.garfield-math.xyz
```

The `wss://` scheme is required — Cloudflare always serves HTTPS/WSS.
The `/wisp/` path (with trailing slash) is required.
Do **not** create a separate public hostname for Wisp itself.

### 5b. Important: keep Wisp private

- Do not assign a public domain to the Wisp service.
- Do not add a second Cloudflare tunnel ingress/hostname for Wisp.
- Do not configure public uptime probes against `:37292` (Wisp is WebSocket-only).

### 6. Start the tunnel

```bash
# Run once to test:
cloudflared tunnel run nexus-proxy

# Install as a systemd service (runs on boot):
cloudflared service install
systemctl enable --now cloudflared
```

### 7. Verify

```bash
curl https://nexus.garfield-math.xyz/health
# → {"status":"ok","version":"1.0.0","port":37291,...}
```

## Zero Trust Access Policy (optional but recommended)

Since this is a proxy, you probably want to restrict who can use it.

In Zero Trust dashboard → Access → Applications → Add an application:
- Type: Self-hosted
- Application domain: nexus.garfield-math.xyz
- Add a policy: allow only your email / identity provider

This means only authenticated users can reach nexus at all — everything
else gets a Cloudflare Access login page.

## WebSocket notes

Cloudflare's tunnel handles WebSocket upgrades automatically. The browser
connects to `wss://nexus.garfield-math.xyz/wisp/` — Cloudflare upgrades the
connection, cloudflared pipes it to `http://localhost:37291/wisp/`, and
nexus's server.js pipes that WebSocket to `wisp:37292` over the Docker
internal network.

No special Cloudflare settings are needed for WebSocket support — it works
out of the box with tunnels.

## Ports that are in use on this project

| Port  | Service | Binding         | Reachable from         |
|-------|---------|-----------------|------------------------|
| 37291 | nexus   | 127.0.0.1 only  | cloudflared tunnel     |
| 37292 | wisp    | Docker internal | nexus container only   |

Neither port is publicly accessible on the internet. Only the Cloudflare
tunnel (running as cloudflared on localhost) can reach port 37291.
