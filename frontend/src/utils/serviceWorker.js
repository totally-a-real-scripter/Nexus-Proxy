/**
 * Service Worker Registration
 * Registers the Ultraviolet service worker at root scope.
 * The SW must be served from / (not /src/) to intercept all paths.
 *
 * Also registers Scramjet's SW if available.
 */

export async function registerSW() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] Service workers not supported. Proxy will not function.");
    return;
  }

  // ── Ultraviolet SW ─────────────────────────────────────────────────────────
  try {
    const uvReg = await navigator.serviceWorker.register("/uv/uv.sw.js", {
      scope: "/service/",
      updateViaCache: "none",
    });
    console.info("[SW] UV registered:", uvReg.scope);

    uvReg.addEventListener("updatefound", () => {
      const installing = uvReg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          console.info("[SW] UV updated — reload for changes.");
        }
      });
    });
  } catch (err) {
    console.error("[SW] UV registration failed:", err);
  }

  // ── Scramjet SW ────────────────────────────────────────────────────────────
  try {
    const sjReg = await navigator.serviceWorker.register("/scramjet/scram.sw.js", {
      scope: "/scram/",
      updateViaCache: "none",
    });
    console.info("[SW] Scramjet registered:", sjReg.scope);
  } catch (err) {
    // Non-fatal — Scramjet SW may not be present in all builds
    console.warn("[SW] Scramjet SW not found (UV will be used as fallback):", err.message);
  }

  // Wait for at least one SW to become active
  await new Promise((resolve) => {
    if (navigator.serviceWorker.controller) {
      resolve();
    } else {
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      // Resolve anyway after 2s — SW may already control the page
      setTimeout(resolve, 2000);
    }
  });
}
