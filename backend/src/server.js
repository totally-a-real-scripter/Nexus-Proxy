/**
 * Nexus Proxy — Main Server
 * Orchestrates: Express HTTP, Bare server (UV transport), WebSocket proxy, metrics
 *
 * Deployment: any reverse-proxy/tunnel in front of Nexus
 *   - Public traffic reaches this process on port 37291
 *   - TLS may be terminated by your edge proxy/tunnel
 *   - /wisp/ WebSocket requests are reverse-proxied internally to wisp:37292
 *   - express "trust proxy" is enabled so rate-limiting reads forwarded client IP
 */

import "dotenv/config";
import http from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { createBareServer } from "@tomphttp/bare-server-node";
import { rateLimit } from "express-rate-limit";

import { metricsService } from "./services/metrics.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { domainFilter } from "./middleware/domainFilter.js";
import apiRouter from "./routes/api.js";
import configRouter from "./routes/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Environment ──────────────────────────────────────────────────────────────
const PORT        = parseInt(process.env.PORT || "37291", 10);
const HOST        = process.env.HOST || "0.0.0.0";
const BARE_PREFIX = process.env.BARE_PREFIX || "/bare/";
const WISP_URL_RAW = (process.env.WISP_URL || "ws://127.0.0.1:37292").trim();
const NODE_ENV    = process.env.NODE_ENV || "production";
const PUBLIC_WISP_URL = (process.env.PUBLIC_WISP_URL || "").trim();

function resolveInternalWispTarget() {
  // Parse internal Wisp host/port for the WebSocket reverse-proxy.
  // Canonical production format: ws://<internal-host>:37292
  try {
    const parsed = new URL(WISP_URL_RAW);
    const badProtocol = parsed.protocol !== "ws:";
    const badPath = parsed.pathname && parsed.pathname !== "/";
    if (badProtocol || badPath) {
      console.warn(
        "[Config] WISP_URL should be internal ws://<host>:37292 (no path); using ws://127.0.0.1:37292 fallback."
      );
      return {
        wispUrl: "ws://127.0.0.1:37292",
        host: "127.0.0.1",
        port: 37292,
      };
    }
    return {
      wispUrl: parsed.toString(),
      host: parsed.hostname,
      port: parseInt(parsed.port || "37292", 10),
    };
  } catch {
    console.warn(
      "[Config] WISP_URL is not a valid URL; using ws://127.0.0.1:37292 fallback."
    );
    return {
      wispUrl: "ws://127.0.0.1:37292",
      host: "127.0.0.1",
      port: 37292,
    };
  }
}

const { wispUrl: WISP_URL, host: WISP_HOST, port: WISP_PORT } = resolveInternalWispTarget();

function isWebSocketUpgrade(req) {
  const upgrade = (req.headers.upgrade || "").toString().toLowerCase();
  const connection = (req.headers.connection || "").toString().toLowerCase();
  const wsKey = req.headers["sec-websocket-key"];
  return upgrade === "websocket" && connection.includes("upgrade") && Boolean(wsKey);
}

function inferredPublicWispUrl(req) {
  const forwardedProto = (req.headers["x-forwarded-proto"] || "")
    .toString()
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto || (req.secure ? "https" : "http");
  const wsProto = proto === "https" ? "wss" : "ws";
  const host = req.headers.host || "localhost";
  return `${wsProto}://${host}/wisp/`;
}

function resolvePublicWispUrl(req) {
  // Enforce a browser-facing URL that always points to Nexus /wisp/,
  // never to the internal Wisp upstream target directly.
  const fallback = inferredPublicWispUrl(req);
  if (!PUBLIC_WISP_URL) return fallback;

  try {
    const parsed = new URL(PUBLIC_WISP_URL);
    const isWs = parsed.protocol === "ws:" || parsed.protocol === "wss:";
    const badPort = parsed.port === "37292";
    const badPath = !parsed.pathname.startsWith("/wisp/");
    if (!isWs || badPort || badPath) {
      console.warn(
        "[Config] PUBLIC_WISP_URL is unsafe/invalid; using inferred Nexus /wisp/ URL instead."
      );
      return fallback;
    }
    return PUBLIC_WISP_URL;
  } catch {
    console.warn(
      "[Config] PUBLIC_WISP_URL is not a valid URL; using inferred Nexus /wisp/ URL instead."
    );
    return fallback;
  }
}

// ─── Bare Server (Ultraviolet transport layer) ────────────────────────────────
// The Bare server acts as the HTTP(S) relay between UV/Scramjet and the target.
const bare = createBareServer(BARE_PREFIX, {
  logErrors: NODE_ENV === "development",
  database: new Map(),
});

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

// Trust upstream proxy headers (for example X-Forwarded-For / X-Forwarded-Proto).
// "1" means trust exactly one hop in front of Nexus.
// This makes express-rate-limit use the real client IP when behind a proxy.
app.set("trust proxy", parseInt(process.env.TRUST_PROXY || "1", 10));

// Security headers — relaxed for proxy use
app.use(
  helmet({
    contentSecurityPolicy:     false,  // Must be off; proxied pages set their own
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy:   false,
    crossOriginResourcePolicy: false,
  })
);

app.use(cors({
  origin:         process.env.CORS_ORIGIN || "*",
  methods:        ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["*"],
}));

app.use(compression());
app.use(morgan(NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Uses the real client IP from CF-Connecting-IP (trust proxy enabled above).
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX        || "200",   10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests. Please slow down." },
  // Don't rate-limit the bare relay — it has its own request cadence
  skip: (req) => req.path.startsWith(BARE_PREFIX),
});
app.use(limiter);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(requestLogger(metricsService));
app.use(domainFilter);

// ─── Static Frontend ─────────────────────────────────────────────────────────
const frontendPath = process.env.FRONTEND_PATH ||
  path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendPath, {
  maxAge: NODE_ENV === "production" ? "1d" : 0,
  etag: true,
}));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api", apiRouter(metricsService));
app.use("/api/config", configRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status:  "ok",
    version: "1.0.0",
    port:    PORT,
    wisp:    WISP_URL,
    uptime:  process.uptime(),
  });
});

// ─── Transport config (sent to browser on startup) ────────────────────────────
// The browser uses PUBLIC_WISP_URL to connect its Epoxy WebSocket transport.
// Production example: wss://nexus.garfield-math.xyz/wisp/
app.get("/api/transport-config", (_req, res) => {
  res.json({
    wispUrl:        resolvePublicWispUrl(_req),
    barePrefix:     BARE_PREFIX,
    scramjetPrefix: process.env.SCRAMJET_PREFIX || "/scram/",
    uvPrefix:       process.env.UV_PREFIX || "/service/",
  });
});

// /wisp/* is WebSocket-upgrade-only. Reject plain HTTP so probes/crawlers
// do not accidentally hit this path expecting a normal web route.
app.all("/wisp/*", (_req, res) => {
  res.status(426).json({
    error: "Upgrade Required",
    message: "Use WebSocket upgrade on /wisp/ via the Nexus public domain.",
  });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res, next) => {
  if (req.path.startsWith(BARE_PREFIX) || req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(frontendPath, "index.html"), (err) => {
    if (err) res.status(404).send("Not found");
  });
});

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer();

server.on("request", (req, res) => {
  if (bare.shouldRoute(req)) {
    bare.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

// ─── WebSocket upgrade handler ─────────────────────────────────────────────────
// Two kinds of WS upgrades arrive here:
//   1. /wisp/*  — browser's Epoxy transport connecting to the Wisp server
//                 → pipe the raw TCP connection to wisp:37292
//   2. /bare/*  — UV/Scramjet bare-server WebSocket relay
//                 → hand off to the Bare server
server.on("upgrade", (req, socket, head) => {
  socket.on("error", (err) => {
    console.error("[WS upgrade] Socket error:", err.message);
    socket.destroy();
  });

  // ── Route /wisp/ to the internal Wisp container ──────────────────────────
  if (req.url.startsWith("/wisp/")) {
    if (!isWebSocketUpgrade(req)) {
      console.warn("[Wisp proxy] Rejected non-WebSocket upgrade request on /wisp/.");
      socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
      return;
    }

    // Strip /wisp/ prefix so the Wisp server sees a plain WebSocket path
    const wispPath = req.url.slice("/wisp".length) || "/";

    // Open a raw TCP connection to the wisp container and pipe it through.
    // We reconstruct the HTTP upgrade handshake manually so the wisp server
    // sees a proper WebSocket upgrade request.
    const upstream = net.connect(WISP_PORT, WISP_HOST, () => {
      // Rebuild the HTTP/1.1 upgrade request headers
      const headers = [
        `GET ${wispPath} HTTP/1.1`,
        `Host: ${WISP_HOST}:${WISP_PORT}`,
        `Upgrade: websocket`,
        `Connection: Upgrade`,
        `Sec-WebSocket-Version: 13`,
      ];

      // Forward relevant headers from the original request
      const forward = [
        "sec-websocket-key",
        "sec-websocket-protocol",
        "sec-websocket-extensions",
        "origin",
        "user-agent",
      ];
      for (const h of forward) {
        if (req.headers[h]) headers.push(`${h}: ${req.headers[h]}`);
      }
      headers.push("", "");  // blank line = end of headers

      upstream.write(headers.join("\r\n"));
      if (head && head.length) upstream.write(head);

      // Bidirectional pipe
      upstream.pipe(socket);
      socket.pipe(upstream);
    });

    upstream.on("error", (err) => {
      console.error("[Wisp proxy] Upstream error:", err.message);
      socket.destroy();
    });

    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
    return;
  }

  // ── Route /bare/* to the Bare server ─────────────────────────────────────
  if (bare.shouldRoute(req)) {
    bare.routeUpgrade(req, socket, head);
    return;
  }

  // Unknown upgrade path — close the socket
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.on("error", (err) => {
  console.error("[Server] Fatal error:", err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`
  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝  v1.0

  🌐 Listening on http://${HOST}:${PORT}
  📡 Bare relay at ${BARE_PREFIX}
  🔌 Wisp internal target: ${WISP_HOST}:${WISP_PORT}
  ☁️  Proxy mode — trust proxy: ${app.get("trust proxy")}
  🌍 Environment: ${NODE_ENV}
  `);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = () => {
  console.log("\n[Server] Shutting down gracefully...");
  server.close(() => {
    bare.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);
