# ── Nexus Proxy — Backend (Node.js + Bare server) ───────────────────────────
# Multi-stage: stage 1 builds the frontend, stage 2 runs everything

# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

# Install deps
COPY frontend/package.json ./
RUN npm install --prefer-offline

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS backend

# Security
RUN addgroup -S nexus && adduser -S -G nexus nexus

WORKDIR /app

# Install backend deps
COPY backend/package.json ./
RUN npm install --omit=dev --prefer-offline

# Copy backend source
COPY backend/src ./src

# Copy built frontend from stage 1
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

RUN chown -R nexus:nexus /app
USER nexus

EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "src/server.js"]
