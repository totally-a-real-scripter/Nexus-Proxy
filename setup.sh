#!/usr/bin/env bash
# ── Nexus Proxy — Development Setup Script ────────────────────────────────────
# Run this once after cloning to install deps and copy UV/Scramjet assets.

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${BLUE}[nexus]${NC} $*"; }
success() { echo -e "${GREEN}[nexus]${NC} ✓ $*"; }
warn()    { echo -e "${YELLOW}[nexus]${NC} ⚠ $*"; }
error()   { echo -e "${RED}[nexus]${NC} ✗ $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Check prerequisites ───────────────────────────────────────────────────────
command -v node   &>/dev/null || error "Node.js not found. Install Node.js ≥ 18."
command -v npm    &>/dev/null || error "npm not found."
command -v python3 &>/dev/null || error "Python 3 not found. Install Python ≥ 3.11."

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  error "Node.js ≥ 18 required (found v${NODE_VER})."
fi
success "Node.js $(node -v)"

# ── Install backend dependencies ──────────────────────────────────────────────
info "Installing backend dependencies..."
cd backend && npm install
cd ..
success "Backend deps installed."

# ── Install frontend dependencies ─────────────────────────────────────────────
info "Installing frontend dependencies..."
cd frontend && npm install
success "Frontend deps installed."

# ── Copy UV service worker assets ────────────────────────────────────────────
info "Copying Ultraviolet service worker assets..."

UV_SRC="node_modules/ultraviolet/dist"
UV_DST="../public/uv"
mkdir -p "$UV_DST"

# Possible filenames across UV versions
for f in uv.bundle.js uv.bundle.min.js; do
  [ -f "$UV_SRC/$f" ] && cp "$UV_SRC/$f" "$UV_DST/uv.bundle.js" && break
done

for f in uv.handler.js uv.handler.min.js; do
  [ -f "$UV_SRC/$f" ] && cp "$UV_SRC/$f" "$UV_DST/uv.handler.js" && break
done

for f in uv.sw.js; do
  [ -f "$UV_SRC/$f" ] && cp "$UV_SRC/$f" "$UV_DST/uv.sw.js" && break
done

[ -f "$UV_DST/uv.bundle.js"  ] && success "uv.bundle.js copied."  || warn "uv.bundle.js not found — check UV version."
[ -f "$UV_DST/uv.handler.js" ] && success "uv.handler.js copied." || warn "uv.handler.js not found."
[ -f "$UV_DST/uv.sw.js"      ] && success "uv.sw.js copied."      || warn "uv.sw.js not found."

# ── Copy Scramjet SW ──────────────────────────────────────────────────────────
info "Copying Scramjet service worker..."

SJ_DST="../public/scramjet"
mkdir -p "$SJ_DST"

# Scramjet may be at different paths depending on version
for SJ_SRC in \
  "node_modules/@mercuryworkshop/scramjet/dist" \
  "node_modules/scramjet/dist"; do
  if [ -f "$SJ_SRC/scram.sw.js" ]; then
    cp "$SJ_SRC/scram.sw.js" "$SJ_DST/scram.sw.js"
    success "scram.sw.js copied from $SJ_SRC"
    break
  fi
done
[ -f "$SJ_DST/scram.sw.js" ] || warn "scram.sw.js not found — Scramjet engine will be unavailable."

# ── Copy Epoxy WASM (for BareMux) ─────────────────────────────────────────────
info "Copying Epoxy transport..."
EPOXY_DST="../public/epoxy"
mkdir -p "$EPOXY_DST"

for EPOXY_SRC in \
  "node_modules/@mercuryworkshop/epoxy-transport/dist" \
  "node_modules/epoxy-transport/dist"; do
  if [ -d "$EPOXY_SRC" ]; then
    cp -r "$EPOXY_SRC"/. "$EPOXY_DST/"
    success "Epoxy assets copied from $EPOXY_SRC"
    break
  fi
done

cd ..

# ── Python dependencies ───────────────────────────────────────────────────────
info "Installing Wisp server Python dependencies..."
cd wisp-server
pip install --quiet -r requirements.txt
cd ..
success "Python deps installed."

# ── Copy env files ────────────────────────────────────────────────────────────
[ -f .env ]           || (cp .env.example .env;           warn "Created .env from example — please review it.")
[ -f backend/.env ]   || (cp backend/.env.example backend/.env;   warn "Created backend/.env from example.")
[ -f frontend/.env ]  || (cp frontend/.env.example frontend/.env; warn "Created frontend/.env from example.")

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Nexus Proxy — Setup Complete ✓    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════╝${NC}"
echo ""
echo "Start development servers:"
echo ""
echo "  Terminal 1 (Wisp server):"
echo "    cd wisp-server && python3 server.py"
echo "    # Listens on ws://localhost:37292"
echo ""
echo "  Terminal 2 (Backend):"
echo "    cd backend && npm run dev"
echo "    # Listens on http://localhost:37291"
echo ""
echo "  Terminal 3 (Frontend — Vite dev server):"
echo "    cd frontend && npm run dev"
echo "    # Listens on http://localhost:5173 (proxied to backend)"
echo ""
echo "  Open:  http://localhost:5173"
echo ""
echo "For Docker + Coolify:"
echo "  Set PUBLIC_WISP_URL=wss://proxy.yourdomain.com/wisp/ in Coolify env vars"
echo "  docker compose up --build"
echo ""
