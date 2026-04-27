/* global UVServiceWorker, Ultraviolet, __uv$config */

importScripts("/uv/uv.bundle.js");
importScripts("/uv.config.js");
importScripts("/uv/uv.sw.js");

function classifyHeaders(headers) {
  return {
    rawType: Object.prototype.toString.call(headers),
    isHeaders: headers instanceof Headers,
    isArray: Array.isArray(headers),
    isPlainObject: Boolean(headers) && typeof headers === "object" && !Array.isArray(headers) && !(headers instanceof Headers)
  };
}

function toRawHeaderPairs(headers) {
  const details = classifyHeaders(headers);
  console.debug("[proxy:headers] converting headers", details);

  const safeHeaders = new Headers();

  if (details.isHeaders) {
    for (const [key, value] of headers.entries()) {
      safeHeaders.set(key, value);
    }
  } else if (details.isArray) {
    for (const [key, value] of headers) {
      safeHeaders.set(key, value);
    }
  } else if (details.isPlainObject) {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        safeHeaders.set(key, String(value));
      }
    }
  }

  return Array.from(safeHeaders.entries());
}

function patchBareClientHeaders() {
  const BareClient = Ultraviolet?.BareClient;
  if (!BareClient?.prototype) return;

  const originalFetch = BareClient.prototype.fetch;
  if (typeof originalFetch === "function") {
    BareClient.prototype.fetch = function patchedFetch(input, init = {}) {
      const safeInit = { ...init };
      safeInit.headers = toRawHeaderPairs(init?.headers);
      return originalFetch.call(this, input, safeInit);
    };
  }

  const originalCreateWebSocket = BareClient.prototype.createWebSocket;
  if (typeof originalCreateWebSocket === "function") {
    BareClient.prototype.createWebSocket = function patchedCreateWebSocket(url, protocols = [], _unused, requestHeaders) {
      const safeRequestHeaders = toRawHeaderPairs(requestHeaders);
      return originalCreateWebSocket.call(this, url, protocols, null, safeRequestHeaders);
    };
  }
}

patchBareClientHeaders();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const uv = new UVServiceWorker(__uv$config);

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      try {
        if (uv.route(event)) {
          return await uv.fetch(event);
        }
        return await fetch(event.request);
      } catch (error) {
        console.error("[proxy:fetch:error]", {
          requestUrl: event.request?.url,
          proxyPath: __uv$config?.prefix,
          stack: error?.stack || String(error)
        });

        const message = `Proxy request failed for ${event.request?.url || "unknown URL"}.`;
        return new Response(`<!doctype html><html><body><h1>Proxy Error</h1><p>${message}</p></body></html>`, {
          status: 500,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store"
          }
        });
      }
    })()
  );
});
