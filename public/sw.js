const ASSET_VERSION = "scramjet-7";
const DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

importScripts(`/scram/scramjet.all.js?v=${ASSET_VERSION}`);

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const bypassSameOrigin = new Set([
  "/",
  "/reset",
  "/health",
  "/client.js",
  "/style.css",
  "/favicon.ico",
  "/sw.js",
  "/robots.txt"
]);

const bypassPrefixes = ["/scram/", "/baremux/", "/epoxy/", "/wisp/", "/assets/"];
let configReadyPromise;

function devLog(...args) {
  if (DEV) console.info(...args);
}

function ensureConfig() {
  if (!configReadyPromise) {
    configReadyPromise = scramjet.loadConfig().catch((error) => {
      configReadyPromise = undefined;
      throw error;
    });
  }
  return configReadyPromise;
}

function shouldBypass(url) {
  if (url.origin !== self.location.origin) return false;
  return bypassSameOrigin.has(url.pathname) || bypassPrefixes.some((prefix) => url.pathname.startsWith(prefix));
}

function storageErrorResponse() {
  return new Response(
    "<!doctype html><title>Proxy Error</title><h1>Proxy storage error</h1><p>Scramjet storage is stale or corrupted. Open <a href='/reset' target='_top'>Reset proxy storage</a> and reload.</p>",
    {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

async function normalizeDocumentResponse(event, response) {
  const destination = event.request.destination || "";
  const contentType = response.headers.get("content-type") || "";

  if ((destination === "document" || destination === "iframe") && (!contentType || contentType.includes("text/plain"))) {
    const body = await response.clone().text();
    if (/^\s*<!doctype html|^\s*<html/i.test(body)) {
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.delete("content-disposition");
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
  }

  return response;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      const url = new URL(event.request.url);

      if (shouldBypass(url)) {
        return fetch(event.request);
      }

      try {
        await ensureConfig();

        if (scramjet.route(event)) {
          const response = await scramjet.fetch(event);
          return normalizeDocumentResponse(event, response);
        }

        return fetch(event.request);
      } catch (error) {
        devLog("[sw] fetch fallback", error?.message || error);

        if (event.request.mode === "navigate") {
          return storageErrorResponse();
        }

        try {
          return await fetch(event.request);
        } catch {
          return new Response("", { status: 502, statusText: "Bad Gateway" });
        }
      }
    })().catch(async (error) => {
      devLog("[sw] outer fetch guard", error?.message || error);
      if (event.request.mode === "navigate") return storageErrorResponse();
      try {
        return await fetch(event.request);
      } catch {
        return new Response("", { status: 500, statusText: "Fetch Failure" });
      }
    })
  );
});
