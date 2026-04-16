# ── Nexus Proxy — Multi-stage Dockerfile ─────────────────────────────────────
# Stage 1: Build the Vite frontend
# Stage 2: Run Node.js backend + serve built frontend
#
# Cloudflare ZT deployment:
#   - Container listens on port 37291
#   - docker-compose binds 127.0.0.1:37291:37291 so only cloudflared can reach it
#   - No TLS inside the container; Cloudflare terminates TLS at the edge

# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

COPY frontend/package.json ./
RUN npm install --prefer-offline

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend runtime ──────────────────────────────────────────────────
FROM node:20-alpine AS backend

# Run as non-root
RUN addgroup -S nexus && adduser -S -G nexus nexus

WORKDIR /app

# Install backend production deps only
COPY backend/package.json ./
RUN npm install --omit=dev --prefer-offline

# Copy backend source
COPY backend/src ./src

# Copy built frontend from stage 1
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

RUN chown -R nexus:nexus /app
USER nexus

# Port 37291 — bound to 127.0.0.1 on host, reachable only by cloudflared
EXPOSE 37291

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:37291/health || exit 1

CMD ["node", "src/server.js"]
