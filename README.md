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
                              │  Node.js Backend (port 37291) │    │
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
                              │  Python Wisp Server (port 37292)       │
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
cp node_modules/ultraviolet/dist/uv.bundle.js public/uv/
cp node_modules/ultraviolet/dist/uv.handler.js public/uv/
cp node_modules/ultraviolet/dist/uv.sw.js       public/uv/

# Scramjet (if using)
cp node_modules/@mercuryworkshop/scramjet/dist/scram.sw.js public/scramjet/

cd ..
```

> **Note:** Exact paths may vary by package version. Check `node_modules/ultraviolet/dist/` for the correct filenames.

### 3. Configure environment

```bash
cp .env.example .env                       # Docker Compose root env
cp backend/.env.example backend/.env       # Backend env
cp frontend/.env.example frontend/.env     # Frontend Vite env
```

Edit `backend/.env`:
```env
WISP_URL=ws://localhost:37292
# Optional in local dev; if omitted Nexus derives it from incoming host.
# If you set it, it must point to Nexus (not Wisp):
PUBLIC_WISP_URL=ws://localhost:5173/wisp/
NODE_ENV=development
```

### 4. Start services

**Terminal 1 — Wisp server:**
```bash
cd wisp-server
python server.py
# Listening on ws://0.0.0.0:37292
```

**Terminal 2 — Backend:**
```bash
cd backend
npm run dev
# Listening on http://0.0.0.0:37291
```

**Terminal 3 — Frontend (Vite dev server):**
```bash
cd frontend
npm run dev
# http://localhost:5173 (proxied to backend via vite.config.js)
```

Open **http://localhost:5173** in your browser.

---

## Docker Deployment

`docker-compose.yml` is **optional and local-dev-only** in this repository.

Use it only when you want to run `nexus` + `wisp` together on your own machine:

```bash
docker compose up --build
```

For production on Coolify, do **not** deploy this repo as one Docker Compose app.
Deploy two independent Dockerfile resources instead (documented below).

---

## Deployment Options

Nexus Proxy does **not** require any specific edge provider. The required architecture is:

- **Only Nexus is public**
- **Wisp stays internal-only**
- **Browser websocket traffic goes through Nexus** (`PUBLIC_WISP_URL`, usually `/wisp/` on the Nexus domain)
- **Server-side Nexus → Wisp traffic uses internal networking** (`WISP_URL=ws://<internal-host>:37292`)

You can satisfy this architecture with:

- A standard reverse proxy/load balancer (Nginx, Caddy, Traefik, HAProxy, etc.), or
- Any secure inbound tunnel solution (optional).


---

## Coolify Deployment

Deploy this project in Coolify as **two separate resources**.

### Canonical production routing (garfield-math.xyz)

- **Only public app:** `nexus`
- **Internal-only app:** `wisp`
- **Public hostname:** `nexus.garfield-math.xyz`
- **Nexus listen port:** `37291`
- **Browser WebSocket URL:** `wss://nexus.garfield-math.xyz/wisp/`
- **Internal Wisp upstream from Nexus:** `ws://<internal-host>:37292`

This routing model is the same whether you publish Nexus through a standard reverse proxy or an inbound tunnel.

### Resource 1: `nexus` (public)

- **Type:** Dockerfile-based application
- **Build context:** repo root
- **Dockerfile:** `./Dockerfile`
- **Port:** `37291`
- **Public domain:** yes (for example `nexus.garfield-math.xyz`)

Set these production environment variables on the `nexus` resource:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `37291` |
| `HOST` | `0.0.0.0` |
| `WISP_URL` | `ws://<internal-wisp-service-name>:37292` |
| `PUBLIC_WISP_URL` | `wss://nexus.garfield-math.xyz/wisp/` |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGIN` | `https://nexus.garfield-math.xyz` |
| `RATE_LIMIT_MAX` | `200` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `CACHE_ENABLED` | `true` |
| `CACHE_MAX_AGE_MS` | `300000` |
| `PROXY_TIMEOUT_MS` | `30000` |
| `WISP_LOG_LEVEL` | `info` |
| `DOMAIN_BLOCKLIST` | *(optional)* |
| `DOMAIN_ALLOWLIST` | *(optional)* |
| `SEARCH_ENGINE` | `https://www.google.com/search?q=` |

### Resource 2: `wisp` (internal-only)

- **Type:** Dockerfile-based application
- **Build context:** `wisp-server/`
- **Dockerfile:** `wisp-server/Dockerfile`
- **Port:** `37292`
- **Public domain:** **no**

Set these environment variables on the `wisp` resource:

| Variable | Value |
|---|---|
| `WISP_HOST` | `0.0.0.0` |
| `WISP_PORT` | `37292` |
| `LOG_LEVEL` | `INFO` |

### Connectivity notes

- Configure `nexus` `WISP_URL` to the **internal Coolify hostname** of your `wisp` resource.
- Keep `PUBLIC_WISP_URL` on `nexus` set to `wss://nexus.garfield-math.xyz/wisp/` so browser clients connect through the public `nexus` domain.
- Do not assign a public domain to `wisp`.
- Do not configure external HTTP/uptime checks against `wisp:37292` (it is WebSocket-only and internal-only).
- Do not use raw TCP-open probes on `37292`; they trigger expected WebSocket handshake errors. Use a protocol-correct WebSocket health check or an application-level Nexus health endpoint instead.

---

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `37291` | Nexus HTTP port |
| `HOST` | `0.0.0.0` | Nexus bind host |
| `NODE_ENV` | `production` | `development` or `production` |
| `BARE_PREFIX` | `/bare/` | Bare server relay prefix |
| `UV_PREFIX` | `/service/` | Ultraviolet proxy prefix |
| `SCRAMJET_PREFIX` | `/scram/` | Scramjet proxy prefix |
| `WISP_URL` | `ws://127.0.0.1:37292` | Internal Wisp WebSocket URL used by Nexus backend |
| `PUBLIC_WISP_URL` | inferred as `ws(s)://<nexus-host>/wisp/` | Browser-facing Wisp URL (must target Nexus `/wisp/`, never direct `:37292`) |
| `TRUST_PROXY` | `1` | Express trust proxy hop count |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | `200` | Max requests per window |
| `CACHE_ENABLED` | `true` | Enable response caching |
| `CACHE_MAX_AGE_MS` | `300000` | Cache TTL in ms |
| `PROXY_TIMEOUT_MS` | `30000` | Proxy request timeout |
| `DOMAIN_BLOCKLIST` | — | Comma-separated blocked domains |
| `DOMAIN_ALLOWLIST` | — | Comma-separated allowed domains (empty = all) |
| `SEARCH_ENGINE` | `https://www.google.com/search?q=` | Search query prefix URL |
| `CORS_ORIGIN` | `*` | CORS allowed origin |
| `WISP_HOST` | `0.0.0.0` | Wisp server bind host |
| `WISP_PORT` | `37292` | Wisp server port |
| `LOG_LEVEL` | `INFO` | Wisp Python logging level |
| `WISP_LOG_LEVEL` | `info` | Optional deployment-level value often mirrored into Wisp `LOG_LEVEL` |

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
- **No public Wisp exposure**: keep Wisp internal-only — no public domain and no external HTTP health check on port `37292`.
- **Use protocol-correct checks**: if you health-check Wisp directly, use a real WebSocket handshake; avoid plain HTTP and raw TCP connect probes.
- **Wisp handshake errors usually indicate misrouting**: repeated `opening handshake failed` / `did not receive a valid HTTP request` logs usually mean a public HTTP probe or misconfigured public hostname is targeting Wisp directly instead of going through Nexus `/wisp/`.
- **No auth by default**: Add authentication (e.g., HTTP Basic Auth in nginx, or a JWT middleware in Express) before exposing this publicly.
- **Logging**: Request logs are in-memory only and reset on restart. For persistent audit logs, pipe Docker logs to a log aggregator (Loki, Datadog, etc.).

---

## License

MIT — see LICENSE file.
