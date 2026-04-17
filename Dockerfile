FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

# Ensure frontend build tools in devDependencies (e.g. vite) are installed
# even when NODE_ENV=production is provided by the build environment.
ENV NODE_ENV=development

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev

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
