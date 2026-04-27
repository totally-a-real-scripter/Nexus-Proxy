# Nexus Proxy (Scramjet)

A clean, minimalist proxy UI powered by **Scramjet + Bare-Mux + Epoxy + Wisp** with an Express server and Dockerfile-only deployment.

## Stack

- Node.js + Express
- `@mercuryworkshop/scramjet`
- `@mercuryworkshop/bare-mux`
- `@mercuryworkshop/epoxy-transport`
- `@mercuryworkshop/wisp-js`

## Features

- Single-page browser-style interface
- Smart address/search parsing
- Scramjet service worker interception
- Bare-Mux + Epoxy transport over Wisp WebSocket
- `/health` endpoint
- Graceful shutdown (`SIGINT`, `SIGTERM`)

## Environment

- `PORT` (default `9876`)
- `NODE_ENV` (recommended `production`)

Server binds to `0.0.0.0`.

## Local run

```bash
npm install
npm start
```

Open: `http://localhost:9876`

Health check: `http://localhost:9876/health`

## Docker (Coolify-friendly, Dockerfile only)

```bash
docker build -t scramjet-proxy .
docker run -e PORT=9876 -p 9876:9876 scramjet-proxy
```

## Routes

- Scramjet static assets: `/scram/`
- Bare-Mux static assets: `/baremux/`
- Epoxy transport: `/epoxy/`
- Wisp WebSocket: `/wisp/`
- Service worker: `/sw.js` (no-cache)
