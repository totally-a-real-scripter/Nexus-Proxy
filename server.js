import compression from "compression";
import express from "express";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const epoxyPath = dirname(require.resolve("@mercuryworkshop/epoxy-transport"));

const HOST = "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "9876", 10) || 9876;
const PROXY_PREFIX = "/service/";
const WISP_ENDPOINT = "/wisp/";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(compression());

app.get("/health", (_req, res) => {
  res.json({ status: "alive" });
});

app.use(
  express.static(join(__dirname, "public"), {
    extensions: ["html"],
    maxAge: "1h"
  })
);

app.use(
  ["/sw.js", "/uv.config.js"],
  express.static(join(__dirname, "public"), {
    etag: true,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    }
  })
);

app.use("/uv/", express.static(uvPath, { maxAge: "1d" }));
app.use("/baremux/", express.static(baremuxPath, { maxAge: "1d" }));
app.use("/epoxy/", express.static(epoxyPath, { maxAge: "1d" }));

app.use((req, res) => {
  if (req.method === "GET") {
    return res.sendFile(join(__dirname, "public", "index.html"));
  }
  return res.status(404).json({ error: "Not found" });
});

const server = createServer(app);

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith(WISP_ENDPOINT)) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log("======================================");
  console.log("Sleek Proxy started");
  console.log(`Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`Host        : ${HOST}`);
  console.log(`Port        : ${PORT}`);
  console.log(`Proxy Prefix: ${PROXY_PREFIX}`);
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

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
