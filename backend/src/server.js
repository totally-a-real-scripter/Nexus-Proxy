/**
 * Nexus Proxy — Main Server
 * Orchestrates: Express HTTP, Bare server (UV transport), WebSocket proxy, metrics
 */

import "dotenv/config";
import http from "http";
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
const PORT        = parseInt(process.env.PORT || "8080", 10);
const HOST        = process.env.HOST || "0.0.0.0";
const BARE_PREFIX = process.env.BARE_PREFIX || "/bare/";
const WISP_URL    = process.env.WISP_URL || "ws://wisp:7000";
const NODE_ENV    = process.env.NODE_ENV || "production";

// ─── Bare Server (Ultraviolet transport layer) ────────────────────────────────
// The Bare server acts as the HTTP(S) relay between UV/Scramjet and the target
const bare = createBareServer(BARE_PREFIX, {
  logErrors: NODE_ENV === "development",
  // Forward Wisp WebSocket connections to the Python wisp-server service
  database: new Map(),
});

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

// Security headers — relaxed for proxy use
app.use(
  helmet({
    contentSecurityPolicy: false,   // Must be off; proxied pages set their own
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["*"],
}));

app.use(compression());
app.use(morgan(NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX        || "200",   10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests. Please slow down." },
  skip: (req) => req.path.startsWith(BARE_PREFIX), // Don't rate-limit proxy traffic
});
app.use(limiter);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(requestLogger(metricsService));   // Capture metrics per request
app.use(domainFilter);                    // Allow/block lists

// ─── Static Frontend ─────────────────────────────────────────────────────────
// Serves the built frontend from /frontend/dist (or /public in dev)
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
    wisp:    WISP_URL,
    uptime:  process.uptime(),
  });
});

// ─── Wisp endpoint info ───────────────────────────────────────────────────────
// Tells the frontend where to connect for WebSocket tunneling
app.get("/api/transport-config", (_req, res) => {
  res.json({
    wispUrl:    process.env.PUBLIC_WISP_URL || WISP_URL,
    barePrefix: BARE_PREFIX,
    scramjetPrefix: process.env.SCRAMJET_PREFIX || "/scram/",
    uvPrefix:   process.env.UV_PREFIX || "/service/",
  });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res, next) => {
  // Don't intercept bare/api requests
  if (req.path.startsWith(BARE_PREFIX) || req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(frontendPath, "index.html"), (err) => {
    if (err) res.status(404).send("Not found");
  });
});

// ─── HTTP Server with WebSocket upgrade handling ──────────────────────────────
const server = http.createServer();

server.on("request", (req, res) => {
  // Route bare-server requests through the Bare relay
  if (bare.shouldRoute(req)) {
    bare.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  // Bare server handles WebSocket upgrades for proxied WS connections
  if (bare.shouldRoute(req)) {
    bare.routeUpgrade(req, socket, head);
  } else {
    socket.end();
  }
});

server.on("error", (err) => {
  console.error("[Server] Error:", err);
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
  🔌 Wisp target: ${WISP_URL}
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
