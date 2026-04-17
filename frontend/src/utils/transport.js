/**
 * Transport Initialiser
 * Fetches the Wisp + Bare configuration from the backend and initialises
 * the Epoxy Transport layer, which provides WebSocket-over-Wisp tunnelling.
 *
 * Epoxy is a BareMux-compatible transport that uses the Wisp protocol
 * to multiplex TCP connections over one WebSocket to the wisp-server.
 *
 * Data flow:
 *   browser fetch/XHR
 *     → UV/Scramjet service worker
 *       → BareMux (transport abstraction)
 *         → EpoxyClient (this file)
 *           → WebSocket to wisp-server (Python)
 *             → TCP to target host
 */

export async function initTransport() {
  // ── 1. Fetch backend config ────────────────────────────────────────────────
  let config = {
    wispUrl:         "",
    barePrefix:      "/bare/",
    scramjetPrefix:  "/scram/",
    uvPrefix:        "/service/",
  };

  try {
    const res = await fetch("/api/transport-config");
    if (res.ok) Object.assign(config, await res.json());
  } catch (err) {
    console.warn("[Transport] Could not fetch config, using defaults:", err.message);
  }

  // ── 2. Resolve Wisp WebSocket URL ──────────────────────────────────────────
  // If PUBLIC_WISP_URL is not set, derive it from the page's own origin.
  if (!config.wispUrl || config.wispUrl.includes("your-domain")) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    config.wispUrl = `${proto}//${location.host}/wisp/`;
  }

  console.info("[Transport] Wisp URL:", config.wispUrl);
  console.info("[Transport] Bare prefix:", config.barePrefix);

  // ── 3. Initialise Epoxy via BareMux ───────────────────────────────────────
  // BareMux is the transport abstraction layer used by Ultraviolet and Scramjet.
  // We set EpoxyClient as the transport so all proxy requests go through Wisp.
  try {
    // Dynamic import so the SW registration completes first
    const { EpoxyClient } = await import(
      /* @vite-ignore */ "@mercuryworkshop/epoxy-transport"
    ).catch(() => ({ EpoxyClient: null }));

    const { BareMux } = await import(
      "@mercuryworkshop/bare-mux"
    ).catch(() => ({ BareMux: null }));

    if (EpoxyClient && BareMux) {
      await BareMux.setTransport("/epoxy/index.js", {
        wisp: config.wispUrl,
      });
      console.info("[Transport] Epoxy transport active via BareMux.");
    } else {
      console.warn("[Transport] Epoxy/BareMux not available — falling back to bare HTTP.");
    }
  } catch (err) {
    console.warn("[Transport] Transport init error (non-fatal):", err.message);
  }

  // Expose config on window so TabManager can read prefix values at runtime
  window.__nexusConfig = config;

  return config;
}
