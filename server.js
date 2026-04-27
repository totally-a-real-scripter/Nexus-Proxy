import compression from "compression";
import express from "express";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const epoxyPath = dirname(require.resolve("@mercuryworkshop/epoxy-transport"));

const HOST = "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "9876", 10) || 9876;
const PROXY_PREFIX = "/service/";
const WISP_ENDPOINT = "/wisp/";
const SCRAMJET_ROUTE = "/scram/";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(compression());

app.get("/health", (_req, res) => {
  res.json({ status: "alive" });
});

const setNoStoreHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
};

app.get("/sw.js", (_req, res) => {
  setNoStoreHeaders(res);
  res.sendFile(join(__dirname, "public", "sw.js"));
});

app.get(WISP_ENDPOINT, (_req, res) => {
  res.status(426).json({
    error: "WebSocket upgrade required",
    endpoint: WISP_ENDPOINT
  });
});

app.use(
  express.static(join(__dirname, "public"), {
    extensions: ["html"],
    maxAge: "1h"
  })
);

app.use(
  SCRAMJET_ROUTE,
  express.static(scramjetPath, {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      if (filePath.includes("scramjet") || filePath.endsWith(".wasm")) {
        setNoStoreHeaders(res);
      }
    }
  })
);
app.use("/baremux/", express.static(baremuxPath, { maxAge: "1d" }));
app.use("/epoxy/", express.static(epoxyPath, { maxAge: "1d" }));

app.use((err, req, res, _next) => {
  console.error("[express:error]", {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    stack: err?.stack || err
  });

  res.status(500).send(`<!doctype html><html><head><title>Proxy Error</title></head><body><h1>Proxy Error</h1><p>Request failed while proxying <code>${req.originalUrl}</code>.</p></body></html>`);
});

app.use((req, res) => {
  if (req.path.startsWith("/uv/")) {
    return res.status(404).json({ error: "Ultraviolet routes removed" });
  }

  if (req.method === "GET") {
    return res.sendFile(join(__dirname, "public", "index.html"));
  }
  return res.status(404).json({ error: "Not found" });
});

const server = createServer(app);

server.on("upgrade", (req, socket, head) => {
  const reqUrl = req.url || "";
  const parsed = new URL(reqUrl, `http://${req.headers.host || "localhost"}`);
  const isWisp = parsed.pathname === WISP_ENDPOINT || parsed.pathname === "/wisp";

  console.info(`[wisp:upgrade] url=${reqUrl} pathname=${parsed.pathname} match=${isWisp}`);

  if (isWisp) {
    wisp.routeRequest(req, socket, head);
    return;
  }

  socket.destroy();
});

server.listen(PORT, HOST, () => {
  console.log("======================================");
  console.log("Nexus Proxy started");
  console.log(`Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`Host        : ${HOST}`);
  console.log(`Port        : ${PORT}`);
  console.log(`Scramjet    : ${SCRAMJET_ROUTE} (prefix ${PROXY_PREFIX})`);
  console.log(`Wisp WS     : ${WISP_ENDPOINT}`);
  console.log(`Local URL   : http://localhost:${PORT}`);
  console.log(`Host URL    : http://${hostname()}:${PORT}`);
  console.log("======================================");
});

const shutdown = (signal) => {
  console.log(`${signal} received: closing HTTP server`);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.warn("Force shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
};

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error?.stack || error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
