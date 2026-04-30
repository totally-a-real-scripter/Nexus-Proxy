# Nexus Gateway (Scramjet)

A browser-style web UI powered by **Scramjet + Bare-Mux + Epoxy + Wisp** with Express and Dockerfile-only deployment.

## Stack

- Node.js + Express
- `@mercuryworkshop/scramjet`
- `@mercuryworkshop/bare-mux`
- `@mercuryworkshop/epoxy-transport`
- `@mercuryworkshop/wisp-js`

## Features

- Full-screen browsing iframe with floating Spotlight-style search overlay
- Toggle overlay with arrow button, `ArrowDown` (open), `ArrowUp` (hide), `Ctrl/Cmd+L` focus, `Esc` collapse/blur
- Smart URL/search parsing
- Built-in search engines (Google, YouTube, DuckDuckGo, GitHub, Reddit, Wikipedia)
- User-defined custom search engines persisted in `localStorage` key `nexus.searchEngines.v1`
- Scramjet service worker interception with bypass list for internal app assets
- `/health` and `/reset` routes

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

Reset site storage: `http://localhost:9876/reset`

## Docker (Coolify-friendly, Dockerfile only)

```bash
docker build -t scramjet-gateway .
docker run -e PORT=9876 -p 9876:9876 scramjet-gateway
```

## Routes

- Scramjet static assets: `/scram/`
- Bare-Mux static assets: `/baremux/`
- Epoxy transport: `/epoxy/`
- Wisp WebSocket: `/wisp/`
- Service worker: `/sw.js` (no-cache)
