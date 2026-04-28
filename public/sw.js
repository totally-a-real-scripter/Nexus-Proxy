const ASSET_VERSION = "scramjet-3";
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

      if (
        url.origin === location.origin &&
        (url.pathname === "/reset" ||
          url.pathname === "/health" ||
          url.pathname.startsWith("/scram/") ||
          url.pathname.startsWith("/baremux/") ||
          url.pathname.startsWith("/epoxy/") ||
          url.pathname === "/client.js" ||
          url.pathname === "/style.css")
      ) {
        return fetch(event.request);
      }

      try {
        await ensureConfig();

        if (scramjet.route(event)) {
          return await scramjet.fetch(event);
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
