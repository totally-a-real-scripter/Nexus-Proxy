const APP_VERSION = "app-2026-05-01-scramjet-1.1.0";

importScripts(`/scram/scramjet.all.js?v=${APP_VERSION}`);

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const bypassExact = new Set([
  "/",
  "/index.html",
  "/reset",
  "/debug-ui",
  "/health",
  "/home.html",
  "/client.js",
  "/style.css",
  "/favicon.ico",
  "/sw.js",
  "/robots.txt"
]);

const bypassPrefixes = ["/scram/", "/baremux/", "/epoxy/", "/wisp/", "/assets/"];
const shouldBypass = (requestUrl) => {
  const url = new URL(requestUrl);
  return (
    url.origin === location.origin &&
    (bypassExact.has(url.pathname) || bypassPrefixes.some((prefix) => url.pathname.startsWith(prefix)))
  );
};

let configReady = null;

async function ensureScramjetConfig() {
  if (!configReady) {
    configReady = scramjet.loadConfig().catch((error) => {
      configReady = null;
      console.error("[sw] Scramjet loadConfig failed:", error);
      throw error;
    });
  }

  return configReady;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      if (shouldBypass(event.request.url)) {
        return fetch(event.request);
      }

      try {
        await ensureScramjetConfig();

        if (scramjet.route(event)) {
          return await scramjet.fetch(event);
        }

        return fetch(event.request);
      } catch (error) {
        console.error("[sw] fetch failed:", {
          message: error.message,
          stack: error.stack,
          url: event.request.url,
          destination: event.request.destination || ""
        });

        if (event.request.mode === "navigate" || event.request.destination === "iframe") {
          return new Response(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Storage error</title></head><body style=\"font-family:system-ui;background:#05070d;color:white;padding:32px\"><h1>Storage error</h1><p>Site storage is stale or corrupted.</p><p><a href=\"/reset\" target=\"_top\" style=\"color:#9cf\">Reset site storage</a> and reload.</p></body></html>",
            {
              status: 500,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store"
              }
            }
          );
        }

        return fetch(event.request);
      }
    })()
  );
});
