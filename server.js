import compression from "compression";
import express from "express";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const epoxyPath = dirname(require.resolve("@mercuryworkshop/epoxy-transport"));

const HOST = "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "9876", 10) || 9876;
const WISP_ENDPOINT = "/wisp/";
const SCRAMJET_ROUTE = "/scram/";
const RESET_DB_NAMES = [
  "$scramjet",
  "scramjet",
  "Scramjet",
  "scramjet-config",
  "scramjet-store",
  "scramjet_db",
  "scramjet-db",
  "$bare-mux",
  "bare-mux",
  "baremux",
  "BareMux",
  "epoxy",
  "Epoxy",
  "proxy-transports",
  "proxyTransport",
  "proxy-transport"
];

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(compression());

const setNoStoreHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
};

app.get("/health", (_req, res) => {
  res.json({ status: "alive" });
});

app.get("/client.js", (_req, res) => {
  setNoStoreHeaders(res);
  res.sendFile(join(__dirname, "public", "client.js"));
});

app.get("/style.css", (_req, res) => {
  setNoStoreHeaders(res);
  res.sendFile(join(__dirname, "public", "style.css"));
});

app.get("/sw.js", (_req, res) => {
  setNoStoreHeaders(res);
  res.sendFile(join(__dirname, "public", "sw.js"));
});

app.get(["/", "/index.html"], (_req, res) => {
  setNoStoreHeaders(res);
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.get("/debug-ui", (_req, res) => {
  setNoStoreHeaders(res);
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nexus Proxy UI Debug</title>
    <link rel="stylesheet" href="/style.css?v=scramjet-12" />
  </head>
  <body>
    <div id="spotlightShell" class="spotlight-shell is-open">
      <form id="searchForm" class="spotlight-panel" autocomplete="off">
        <div class="spotlight-input-row">
          <span class="spotlight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <input
            id="urlInput"
            class="spotlight-input"
            type="text"
            placeholder="Search or enter URL"
            spellcheck="false"
            autocomplete="off"
            aria-label="Search or enter URL"
          />
          <button id="clearInput" class="spotlight-clear" type="button" aria-label="Clear search">×</button>
        </div>
      </form>

      <button id="spotlightToggle" class="spotlight-toggle" type="button" aria-label="Toggle search">
        <span class="toggle-arrow">⌄</span>
      </button>
    </div>
  </body>
</html>`);
});

app.get("/reset", (_req, res) => {
  setNoStoreHeaders(res);
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Reset Proxy Storage</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
      code { background: #f1f3f5; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>Resetting proxy storage...</h1>
    <p>Please wait while we clear proxy storage and service workers.</p>
    <pre id="status">Starting reset…</pre>
    <script>
      const status = document.getElementById("status");
      const deleteDb = (name) => {
        if (!name || !("indexedDB" in window)) return Promise.resolve(false);
        return new Promise((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
          request.onblocked = () => resolve(false);
        });
      };

      async function resetAll() {
        const logs = [];
        const dbNames = new Set(${JSON.stringify(RESET_DB_NAMES)});

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
            logs.push("Unregistered service worker: " + (registration.scope || "unknown"));
          }
        }

        if ("caches" in window) {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            const deleted = await caches.delete(name);
            logs.push("Deleted cache " + name + ": " + deleted);
          }
        }

        if ("indexedDB" in window && typeof indexedDB.databases === "function") {
          try {
            const databases = await indexedDB.databases();
            for (const db of databases) {
              if (db.name && /scram|bare|mux|epoxy|proxy|transport/i.test(db.name)) {
                dbNames.add(db.name);
              }
            }
          } catch (error) {
            logs.push("Unable to enumerate databases: " + String(error));
          }
        }

        for (const name of dbNames) {
          const deleted = await deleteDb(name);
          logs.push("Tried deleting IndexedDB " + name + ": " + deleted);
        }

        try {
          localStorage.clear();
          logs.push("Cleared localStorage");
        } catch (error) {
          logs.push("localStorage clear failed: " + String(error));
        }

        try {
          sessionStorage.clear();
          logs.push("Cleared sessionStorage");
        } catch (error) {
          logs.push("sessionStorage clear failed: " + String(error));
        }

        status.textContent = "Proxy storage reset complete\\n\\n" + logs.join("\\n") + "\\n\\nReloading…";
        await new Promise((resolve) => setTimeout(resolve, 1200));
        location.replace("/?reset=" + Date.now());
      }

      resetAll().catch((error) => {
        status.textContent = "Reset failed\\n\\n" + String(error && (error.stack || error));
      });
    </script>
  </body>
</html>`);
});

app.get(WISP_ENDPOINT, (_req, res) => {
  res.status(426).json({
    error: "WebSocket upgrade required",
    endpoint: WISP_ENDPOINT
  });
});

app.use("/baremux/", (_req, res, next) => {
  setNoStoreHeaders(res);
  next();
});

app.use("/epoxy/", (_req, res, next) => {
  setNoStoreHeaders(res);
  next();
});

app.use("/scram/", (_req, res, next) => {
  setNoStoreHeaders(res);
  next();
});

app.use(SCRAMJET_ROUTE, express.static(scramjetPath, { maxAge: 0 }));

app.use(
  express.static(join(__dirname, "public"), {
    extensions: ["html"],
    maxAge: 0
  })
);

app.use("/baremux/", express.static(baremuxPath, { maxAge: 0 }));
app.use("/epoxy/", express.static(epoxyPath, { maxAge: 0 }));

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
  if (req.method === "GET") {
    setNoStoreHeaders(res);
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

const scramjetSanityFiles = ["scramjet.all.js", "scramjet.sync.js", "scramjet.wasm.wasm"];

server.listen(PORT, HOST, () => {
  console.log("======================================");
  console.log("Nexus Proxy started");
  console.log(`Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`Host        : ${HOST}`);
  console.log(`Port        : ${PORT}`);
  console.log(`Scramjet    : ${SCRAMJET_ROUTE}`);
  console.log(`BareMux     : /baremux/ (exists=${existsSync(baremuxPath)}) path=${baremuxPath}`);
  console.log(`Epoxy       : /epoxy/ (exists=${existsSync(epoxyPath)}) path=${epoxyPath}`);
  console.log(`Scram Path  : exists=${existsSync(scramjetPath)} path=${scramjetPath}`);
  console.log(`Wisp WS     : ${WISP_ENDPOINT}`);
  console.log(`Wisp Upgrade: enabled=true`);
  console.log(`Local URL   : http://localhost:${PORT}`);
  console.log(`Host URL    : http://${hostname()}:${PORT}`);
  for (const filename of scramjetSanityFiles) {
    const fullPath = join(scramjetPath, filename);
    console.log(`[sanity] ${filename} exists=${existsSync(fullPath)} path=${fullPath}`);
  }
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
