const ASSET_VERSION = "scramjet-5";
importScripts(`/scram/scramjet.all.js?v=${ASSET_VERSION}`);

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

let configReadyPromise = null;

async function ensureConfig() {
  if (!configReadyPromise) {
    configReadyPromise = scramjet.loadConfig().catch((error) => {
      configReadyPromise = null;
      console.error("Scramjet loadConfig failed:", error);
      throw error;
    });
    configReadyPromise.then(() => {
      console.info("[sw] loadConfig success");
    });
  }

  return configReadyPromise;
}

function storageErrorResponse() {
  return new Response(
    "<!doctype html><title>Proxy Error</title><h1>Proxy storage error</h1><p>Scramjet storage is stale or corrupted. Open <a href='/reset' target='_top'>Reset proxy storage</a> to clear proxy storage, then reload.</p>",
    {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

function isInternalBypass(url) {
  return (
    url.pathname === "/" ||
    url.pathname === "/reset" ||
    url.pathname === "/health" ||
    url.pathname === "/client.js" ||
    url.pathname === "/style.css" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/sw.js" ||
    url.pathname === "/robots.txt" ||
    url.pathname.startsWith("/scram/") ||
    url.pathname.startsWith("/baremux/") ||
    url.pathname.startsWith("/epoxy/") ||
    url.pathname.startsWith("/wisp/") ||
    url.pathname.startsWith("/assets/")
  );
}

function safeLogRequest(event) {
  const request = event.request;
  const url = new URL(request.url);
  console.debug("[scramjet-sw] route request", {
    url: request.url,
    pathname: url.pathname,
    method: request.method,
    destination: request.destination,
    mode: request.mode,
    credentials: request.credentials,
    redirect: request.redirect,
    referrer: request.referrer,
    hasClientId: !!event.clientId
  });
}

self.addEventListener("install", () => {
  console.info("[sw] install");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.info("[sw] activate");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      const url = new URL(event.request.url);

      if (url.origin === location.origin && isInternalBypass(url)) {
        return fetch(event.request);
      }

      try {
        await ensureConfig();

        if (scramjet.route(event)) {
          try {
            safeLogRequest(event);
            const response = await scramjet.fetch(event);
            console.debug("[scramjet-sw] response returned", {
              type: response && response.type,
              status: response && response.status,
              url: response && response.url,
              redirected: response && response.redirected,
              contentType: response?.headers?.get ? response.headers.get("content-type") ?? null : null
            });
            return response;
          } catch (error) {
            console.error("[scramjet-sw] scramjet.fetch failed", {
              message: error && error.message,
              stack: error && error.stack,
              requestUrl: event.request && event.request.url,
              destination: event.request && event.request.destination
            });
            throw error;
          }
        }

        return await fetch(event.request);
      } catch (error) {
        console.error("Scramjet fetch handler failed:", error);

        if (event.request.mode === "navigate") {
          return storageErrorResponse();
        }

        try {
          return await fetch(event.request);
        } catch {
          return new Response("", { status: 502, statusText: "Bad Gateway" });
        }
      }
    })()
  );
});
