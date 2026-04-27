# Nexus Proxy (Legal & Educational)

A clean, modern, minimalist web proxy built with **Node.js + Express + Ultraviolet + Bare-Mux + Epoxy transport + Wisp**.

> This project is intended for legal and educational use only. Only test against systems and networks you own or are explicitly authorized to test.

## Why this stack

This implementation chooses **Ultraviolet + Wisp transport (via Bare-Mux + Epoxy)** because it is practical, actively used in modern service-worker interception proxy setups, and supports dynamic web apps better than older static rewriting-only approaches.

### Brief comparison

- **Ultraviolet + Wisp (chosen):** strong service-worker interception model, mature ecosystem, supports SPA-like browsing patterns, with WebSocket-capable transport.
- **Rammerhead-style:** useful for some use cases but typically more tightly coupled to session isolation patterns than needed for a minimal educational setup.
- **Nebula-style deployments:** often wrap UV plus broader platform features; great as full platforms, heavier than needed for this focused build.
- **Titanium tooling generally:** UV remains a practical core for deployable educational proxies.
- **Newer options (e.g., Scramjet-based ecosystems):** promising, but UV + Wisp currently offers simpler deployability for this repository’s explicit goals.

## Features

- Single-page browser-style UI.
- Rounded minimalist address/search bar.
- URL/search smart parsing:
  - Contains dot and no spaces => URL (auto prepends `https://` if missing).
  - Otherwise => Google search query.
- Proxied content rendered in full-viewport iframe.
- Address bar behavior:
  - centered at first load,
  - compact after navigation,
  - hides while scrolling down,
  - shows on scroll up / mouse near top / `Ctrl+L` or `Cmd+L`.
- Service worker based request interception via Ultraviolet.
- Wisp WebSocket endpoint at `/wisp/`.
- Health endpoint at `/health`.
- Graceful shutdown (`SIGINT`, `SIGTERM`).

## Configuration

Environment variables:

- `PORT` (default: `9876`)

Server binds to:

- `0.0.0.0:$PORT`

Proxy routing:

- Proxy prefix: `/service/`
- Wisp endpoint: `/wisp/`

## Local run

```bash
npm install
npm start
```

Open:

- `http://localhost:9876` (or your configured `PORT`)

Health check:

- `http://localhost:9876/health`

## Docker (Dockerfile only)

```bash
docker build -t sleek-proxy .
docker run -e PORT=9876 -p 9876:9876 sleek-proxy
```

## Coolify deployment

1. Use **Dockerfile build pack**.
2. Set `PORT=9876` (or another unused uncommon internal port).
3. Ensure Coolify routes your public domain to that internal port.
4. Do **not** use Docker Compose mode.
5. Deploy and verify `/health` returns:
   ```json
   { "status": "alive" }
   ```

## Notes on caching and SW freshness

- Static vendor assets are cacheable.
- `sw.js` and `uv.config.js` are served with no-store headers to avoid stale service-worker deployments.
