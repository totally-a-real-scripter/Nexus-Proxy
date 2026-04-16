FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend

RUN addgroup -S nexus && adduser -S -G nexus nexus

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

RUN chown -R nexus:nexus /app
USER nexus

EXPOSE 37291

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:37291/health || exit 1

CMD ["node", "src/server.js"]
