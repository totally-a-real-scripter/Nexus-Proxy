const ASSET_VERSION = "scramjet-6";
importScripts(`/scram/scramjet.all.js?v=${ASSET_VERSION}`);

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const bypassSameOrigin = [
  "/",
  "/reset",
  "/health",
  "/client.js",
  "/style.css",
  "/favicon.ico",
  "/sw.js",
  "/robots.txt"
];

const bypassPrefixes = ["/scram/", "/baremux/", "/epoxy/", "/wisp/", "/assets/"];

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

function logScramjetRequest(event) {
  const request = event.request;
  const url = new URL(request.url);

  console.debug("[scramjet-debug] before fetch", {
    requestUrl: request.url,
    pathname: url.pathname,
    search: url.search,
    method: request.method,
    mode: request.mode,
    destination: request.destination || "",
    referrer: request.referrer || "",
    clientId: event.clientId || "",
    resultingClientId: event.resultingClientId || ""
  });
}

function logScramjetResponse(event, response) {
  console.debug("[scramjet-debug] after fetch", {
    requestUrl: event.request.url,
    status: response.status,
    statusText: response.statusText,
    type: response.type,
    url: response.url || "",
    redirected: response.redirected,
    contentType: response.headers.get("content-type") || "",
    contentDisposition: response.headers.get("content-disposition") || "",
    location: response.headers.get("location") || ""
  });
}

async function normalizeDocumentResponse(event, response) {
  const destination = event.request.destination || "";
  const contentType = response.headers.get("content-type") || "";

  if (
    (destination === "document" || destination === "iframe") &&
    (!contentType || contentType.includes("text/plain"))
  ) {
    const text = await response.clone().text();

    if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.delete("content-disposition");

      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
  }

  return response;
}

function shouldBypass(url) {
  return (
    url.origin === location.origin &&
    (bypassSameOrigin.includes(url.pathname) ||
      bypassPrefixes.some((prefix) => url.pathname.startsWith(prefix)))
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

      if (shouldBypass(url)) {
        return fetch(event.request);
      }

      try {
        await ensureConfig();

        if (scramjet.route(event)) {
          logScramjetRequest(event);

          const response = await scramjet.fetch(event);
          logScramjetResponse(event, response);

          return await normalizeDocumentResponse(event, response);
        }

        return await fetch(event.request);
      } catch (error) {
        console.error("[scramjet-debug] fetch failed", {
          message: error.message,
          stack: error.stack,
          requestUrl: event.request.url,
          pathname: new URL(event.request.url).pathname,
          destination: event.request.destination || ""
        });

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
