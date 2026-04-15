# Nexus Proxy

A production-ready web proxy platform built with Ultraviolet, Scramjet, Epoxy Transport, and Wisp — wrapped in a modern glassmorphism dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser                                    │
│                                                                     │
│  ┌──────────────┐   URL encode   ┌─────────────────────────────┐   │
│  │  React/Vite  │ ─────────────▶ │   UV / Scramjet             │   │
│  │  Dashboard   │                │   Service Worker             │   │
│  └──────────────┘                └──────────┬──────────────────┘   │
│                                             │ fetch/XHR intercept  │
│                                  ┌──────────▼──────────────────┐   │
│                                  │   BareMux Transport Layer   │   │
│                                  │   (EpoxyClient)             │   │
│                                  └──────────┬──────────────────┘   │
└─────────────────────────────────────────────┼───────────────────────┘
                                              │ WebSocket (Wisp proto)
┌─────────────────────────────────────────────▼───────────────────────┐
│                          Nginx (TLS termination)                    │
│  /wisp/  ──────────────────────────────────────────────────────┐    │
│  /*      ──────────────────────────────────────────────┐       │    │
└─────────────────────────────────────────────────────────┼───────┼───┘
                                                          │       │
                              ┌───────────────────────────▼──┐    │
                              │  Node.js Backend (port 8080) │    │
                              │                              │    │
                              │  • Express HTTP server       │    │
                              │  • @tomphttp/bare-server     │    │
                              │  • Rate limiting             │    │
                              │  • Domain filter middleware  │    │
                              │  • Metrics / SSE stream      │    │
                              │  • Config API                │    │
                              │  • Static frontend serving   │    │
                              └──────────────────────────────┘    │
                                                                   │
                              ┌────────────────────────────────────▼──┐
                              │  Python Wisp Server (port 7000)       │
                              │                                        │
                              │  • WebSocket listener                  │
                              │  • Wisp protocol (CONNECT/DATA/CLOSE) │
                              │  • Raw TCP connections to target hosts │
                              │  • Flow control (CONTINUE packets)     │
                              └────────────────────────────┬──────────┘
                                                           │ TCP
                                              ┌────────────▼──────────┐
                                              │   Target Website       │
                                              │   (any HTTP/HTTPS)    │
                                              └───────────────────────┘
```

### Key Technology Roles

| Component | Role |
|---|---|
| **Ultraviolet** | Service worker that intercepts and rewrites browser requests through the proxy prefix `/service/` |
| **Scramjet** | Alternative SW engine with more aggressive JS rewriting — prefix `/scram/` |
| **BareMux** | Transport abstraction layer — UV/Scramjet use it to send actual HTTP/WS through a configurable transport |
| **Epoxy Transport** | BareMux-compatible client that tunnels connections through Wisp WebSocket |
| **Wisp Server** | Python WS server implementing the Wisp protocol — multiplexes TCP streams over one WebSocket |
| **Bare Server** | Node.js relay that handles HTTP/WS proxy requests from UV when Epoxy is unavailable |

---

## Project Structure

```
nexus-proxy/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express + Bare server, WS upgrade handler
│   │   ├── routes/
│   │   │   ├── api.js             # Metrics, logs, SSE stream, URL resolver
│   │   │   └── config.js          # Runtime config CRUD
│   │   ├── middleware/
│   │   │   ├── requestLogger.js   # Per-request timing → MetricsService
│   │   │   └── domainFilter.js    # Allow/blocklist enforcement
│   │   └── services/
│   │       └── metrics.js         # In-memory stats + SSE broadcaster
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── public/
│   │   ├── uv/                    # UV bundle + SW (from node_modules)
│   │   │   ├── uv.bundle.js
│   │   │   ├── uv.config.js       # UV codec and prefix config
│   │   │   ├── uv.handler.js
│   │   │   └── uv.sw.js           # UV service worker
│   │   └── scramjet/
│   │       ├── scram.config.js
│   │       └── scram.sw.js        # Scramjet service worker
│   ├── src/
│   │   ├── app.js                 # Bootstrap, shell render, navigation wiring
│   │   ├── components/
│   │   │   ├── TabManager.js      # Multi-tab proxy sessions
│   │   │   ├── Dashboard.js       # SSE-powered metrics + log viewer
│   │   │   ├── ConfigPanel.js     # Proxy settings form
│   │   │   └── HistoryManager.js  # localStorage browsing history
│   │   ├── utils/
│   │   │   ├── serviceWorker.js   # SW registration (UV + Scramjet)
│   │   │   ├── transport.js       # Epoxy/BareMux initialisation
│   │   │   ├── dom.js             # DOM helpers ($, $$, on)
│   │   │   └── icons.js           # Inline SVG icons
│   │   └── styles/
│   │       └── main.css           # Full design system (glassmorphism dark)
│   ├── index.html
│   ├── vite.config.js
│   └── .env.example
│
├── wisp-server/
│   ├── server.py                  # Asyncio Wisp protocol implementation
│   ├── requirements.txt
│   └── Dockerfile
│
├── nginx/
│   ├── nginx.conf                 # Main nginx config
│   └── conf.d/
│       └── nexus.conf             # Virtual host: TLS, /wisp/ WS, proxy
│
├── Dockerfile                     # Multi-stage: builds frontend + backend
├── docker-compose.yml             # Full stack: nexus + wisp + nginx
├── .env.example                   # Root env vars for compose
└── README.md
```

---

## Local Development Setup

### Prerequisites
- Node.js ≥ 18
- Python ≥ 3.11
- npm ≥ 9

### 1. Clone and install

```bash
git clone https://github.com/yourorg/nexus-proxy.git
cd nexus-proxy

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Wisp server
cd wisp-server && pip install -r requirements.txt && cd ..
```

### 2. Copy UV/Scramjet assets to public/

After `npm install` in the frontend, copy the service worker bundles:

```bash
cd frontend

# Ultraviolet
cp node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js public/uv/
cp node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.handler.js public/uv/
cp node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.sw.js       public/uv/

# Scramjet (if using)
cp node_modules/@mercuryworkshop/scramjet/dist/scram.sw.js public/scramjet/

cd ..
```

> **Note:** Exact paths may vary by package version. Check `node_modules/@titaniumnetwork-dev/ultraviolet/dist/` for the correct filenames.

### 3. Configure environment

```bash
cp .env.example .env                       # Docker Compose root env
cp backend/.env.example backend/.env       # Backend env
cp frontend/.env.example frontend/.env     # Frontend Vite env
```

Edit `backend/.env`:
```env
WISP_URL=ws://localhost:7000
PUBLIC_WISP_URL=ws://localhost/wisp/
NODE_ENV=development
```

### 4. Start services

**Terminal 1 — Wisp server:**
```bash
cd wisp-server
python server.py
# Listening on ws://0.0.0.0:7000
```

**Terminal 2 — Backend:**
```bash
cd backend
npm run dev
# Listening on http://0.0.0.0:8080
```

**Terminal 3 — Frontend (Vite dev server):**
```bash
cd frontend
npm run dev
# http://localhost:3000 (proxied to backend via vite.config.js)
```

Open **http://localhost:3000** in your browser.

---

## Docker Deployment

### Quick start (HTTP only)

```bash
cp .env.example .env
# Edit PUBLIC_WISP_URL to ws://your-ip/wisp/

docker compose up --build
```

### Production (with TLS)

1. Put your certificates in `nginx/certs/`:
   - `nginx/certs/fullchain.pem`
   - `nginx/certs/privkey.pem`

2. Edit `.env`:
   ```env
   PUBLIC_WISP_URL=wss://proxy.yourdomain.com/wisp/
   CORS_ORIGIN=https://proxy.yourdomain.com
   ```

3. Start:
   ```bash
   docker compose up -d --build
   docker compose logs -f
   ```

### Individual container builds

```bash
# Backend (includes frontend build)
docker build -t nexus-backend .

# Wisp server
docker build -t nexus-wisp ./wisp-server
```

---

## Coolify Deployment

Coolify is a self-hosted Heroku/Vercel alternative that makes Docker deployment straightforward.

### Step-by-step

#### 1. Add your repository

- Open Coolify → **Projects** → **New Project**
- Connect your Git repository (GitHub/GitLab/Gitea)

#### 2. Create a Docker Compose service

- Click **New Service** → **Docker Compose**
- Point to the `docker-compose.yml` in the repo root
- Coolify will parse all services automatically

#### 3. Configure environment variables

In Coolify's UI, go to **Environment Variables** and add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_WISP_URL` | `wss://proxy.yourdomain.com/wisp/` |
| `CORS_ORIGIN` | `https://proxy.yourdomain.com` |
| `RATE_LIMIT_MAX` | `200` |
| `DOMAIN_BLOCKLIST` | *(optional, comma-separated)* |
| `WISP_LOG_LEVEL` | `INFO` |

#### 4. Configure TLS

- In Coolify → **Service** → **Domains**, add your domain
- Enable **Let's Encrypt** — Coolify handles cert issuance and renewal automatically
- The nginx service in docker-compose handles TLS; if Coolify fronts with its own Traefik proxy, you can remove the nginx service and expose port 8080 directly — Coolify's Traefik will handle TLS

#### 5. Wisp WebSocket path

If Coolify's Traefik is in front (recommended), you need a path-based routing rule for `/wisp/`:

Add a label to the `wisp` service in `docker-compose.yml`:
```yaml
wisp:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.wisp.rule=Host(`proxy.yourdomain.com`) && PathPrefix(`/wisp/`)"
    - "traefik.http.routers.wisp.entrypoints=websecure"
    - "traefik.http.services.wisp.loadbalancer.server.port=7000"
    - "traefik.http.middlewares.wisp-strip.stripprefix.prefixes=/wisp"
    - "traefik.http.routers.wisp.middlewares=wisp-strip"
```

And for the nexus backend:
```yaml
nexus:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.nexus.rule=Host(`proxy.yourdomain.com`)"
    - "traefik.http.routers.nexus.entrypoints=websecure"
    - "traefik.http.services.nexus.loadbalancer.server.port=8080"
```

#### 6. Deploy

Click **Deploy** — Coolify will:
1. Build both Docker images
2. Start all three services on the internal network
3. Issue and configure TLS certificates
4. Begin routing traffic

#### 7. Verify

```bash
# Health check
curl https://proxy.yourdomain.com/health

# Expected:
# {"status":"ok","version":"1.0.0","wisp":"ws://wisp:7000","uptime":42}
```

---

### Common 404 causes (Coolify / Traefik)

If your domain shows a plain `404 page not found`, traffic is usually not reaching Nexus yet.

1. **Domain target**: ensure the domain points to the correct service
   - bundled proxy mode: `nginx`
   - direct app mode (Traefik TLS termination): `nexus`
2. **Target port**:
   - `nginx` should be reachable on `80` (or `443` for end-to-end TLS)
   - `nexus` should be reachable on `8080`
3. **Public Wisp URL**: set `PUBLIC_WISP_URL` to your public domain, e.g.:
   - `wss://proxy.yourdomain.com/wisp/`

Quick checks:

```bash
curl -I http://<service-ip>:80/health
curl -I https://proxy.yourdomain.com/health
```

Nexus should return `HTTP/1.1 200` for `/health`.

---

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Backend HTTP port |
| `NODE_ENV` | `production` | `development` or `production` |
| `BARE_PREFIX` | `/bare/` | Bare server relay prefix |
| `UV_PREFIX` | `/service/` | Ultraviolet proxy prefix |
| `SCRAMJET_PREFIX` | `/scram/` | Scramjet proxy prefix |
| `WISP_URL` | `ws://wisp:7000` | Internal Wisp WebSocket URL |
| `PUBLIC_WISP_URL` | — | Browser-facing Wisp URL (must be public) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | `200` | Max requests per window |
| `CACHE_ENABLED` | `true` | Enable response caching |
| `CACHE_MAX_AGE_MS` | `300000` | Cache TTL in ms |
| `PROXY_TIMEOUT_MS` | `30000` | Proxy request timeout |
| `DOMAIN_BLOCKLIST` | — | Comma-separated blocked domains |
| `DOMAIN_ALLOWLIST` | — | Comma-separated allowed domains (empty = all) |
| `SEARCH_ENGINE` | Google | Search query prefix URL |
| `CORS_ORIGIN` | `*` | CORS allowed origin |
| `WISP_HOST` | `0.0.0.0` | Wisp server bind host |
| `WISP_PORT` | `7000` | Wisp server port |
| `WISP_LOG_LEVEL` | `INFO` | Python logging level |

---

## Responsible Use

This platform is provided for **lawful purposes only**:
- Privacy-preserving browsing on trusted networks
- Academic and security research
- Accessing content in network-restricted environments you are authorised to use

**Do not** use Nexus to access illegal content, circumvent security controls you are not authorised to bypass, or conduct activities prohibited by your jurisdiction's laws. The operators of this platform are not responsible for user conduct.

---

## Security Considerations

- **Rate limiting** is enabled by default (200 req/min per IP). Adjust `RATE_LIMIT_MAX`.
- **Domain filtering**: Use `DOMAIN_BLOCKLIST` to block known malicious domains, or `DOMAIN_ALLOWLIST` for strict access control.
- **Service isolation**: The wisp server and backend run as non-root users in separate containers on an internal Docker network.
- **No auth by default**: Add authentication (e.g., HTTP Basic Auth in nginx, or a JWT middleware in Express) before exposing this publicly.
- **Logging**: Request logs are in-memory only and reset on restart. For persistent audit logs, pipe Docker logs to a log aggregator (Loki, Datadog, etc.).

---

## License

MIT — see LICENSE file.
