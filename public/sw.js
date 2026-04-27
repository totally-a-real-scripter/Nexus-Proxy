/* global UVServiceWorker, __uv$config */

importScripts("/uv/uv.bundle.js");
importScripts("/uv.config.js");
importScripts("/uv/uv.sw.js");

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
      if (uv.route(event)) {
        return uv.fetch(event);
      }
      return fetch(event.request);
    })()
  );
});
