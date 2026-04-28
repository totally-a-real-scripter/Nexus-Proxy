const WISP_PATH = "/wisp/";
const ASSET_VERSION = "scramjet-3";
const SCRAMJET_DB_NAMES = ["$scramjet", "bare-mux"];
const SCRAMJET_STORAGE_KEYS = ["scramjet", "$scramjet", "bare-mux-path", "baremux"];

const omnibarWrap = document.getElementById("omnibarWrap");
const navForm = document.getElementById("navForm");
const addressInput = document.getElementById("addressInput");
const proxyFrame = document.getElementById("proxyFrame");

let swReadyPromise;
let transportReadyPromise;
let scramjetReadyPromise;
let scramjetFrame;
let appBootPromise;
let hasNavigated = false;
let lastScrollY = 0;
let hideTimer;

function normalizeInput(raw) {
  const value = raw.trim();
  if (!value) return null;

  const looksLikeUrl = value.includes(".") && !value.includes(" ");
  if (looksLikeUrl) {
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value) ? value : `https://${value}`;
    try {
      return new URL(withProtocol).toString();
    } catch {
      return null;
    }
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

async function deleteDatabase(name) {
  if (!("indexedDB" in window)) return false;

  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

function clearScramjetStorageKeys() {
  for (const key of SCRAMJET_STORAGE_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

async function resetScramjetStorage() {
  for (const name of SCRAMJET_DB_NAMES) {
    await deleteDatabase(name);
  }

  clearScramjetStorageKeys();
}

async function hardResetProxyStorage() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    await registration.unregister();
  }

  await resetScramjetStorage();

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }

  location.href = `/?reset=${Date.now()}`;
}

function showResetProxyError(error) {
  console.error("Scramjet initialization failed after recovery.", error);

  const existing = document.getElementById("proxyErrorBanner");
  if (existing) return;

  const banner = document.createElement("div");
  banner.id = "proxyErrorBanner";
  banner.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:9999",
    "background:#16181dcc",
    "backdrop-filter:blur(8px)",
    "border:1px solid #3a3f4b",
    "border-radius:12px",
    "padding:12px",
    "max-width:360px",
    "color:#e8ecf2",
    "font-family:system-ui,sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,.35)"
  ].join(";");

  banner.innerHTML = `
    <strong style="display:block;margin-bottom:6px;">Proxy startup failed</strong>
    <p style="margin:0 0 10px 0;font-size:14px;line-height:1.4;">Proxy startup failed. Reset proxy storage.</p>
    <button id="resetProxyStorageBtn" type="button" style="background:#5a9cff;color:#04121f;border:0;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer;">Reset proxy storage</button>
  `;

  document.body.appendChild(banner);

  document.getElementById("resetProxyStorageBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("resetProxyStorageBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Resetting...";
    }

    try {
      await hardResetProxyStorage();
    } catch (resetError) {
      console.error("Hard reset failed.", resetError);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Reset failed (retry)";
      }
    }
  });
}

async function ensureTransport() {
  if (transportReadyPromise) return transportReadyPromise;

  transportReadyPromise = (async () => {
    console.info("[proxy:init] BareMux global", !!window.BareMux);

    if (!window.BareMux?.BareMuxConnection) {
      throw new Error("BareMux runtime missing.");
    }

    const conn = new window.BareMux.BareMuxConnection(`/baremux/worker.js?v=${ASSET_VERSION}`);
    const wispUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host +
      WISP_PATH;

    console.info("[proxy:init] Transport URL", `/epoxy/index.mjs?v=${ASSET_VERSION}`);
    console.info("[proxy:init] Wisp URL", wispUrl);
    await conn.setTransport(`/epoxy/index.mjs?v=${ASSET_VERSION}`, [{ wisp: wispUrl }]);
    console.info("[proxy:init] BareMux transport configured");
  })();

  return transportReadyPromise;
}

async function ensureServiceWorker() {
  if (swReadyPromise) return swReadyPromise;

  swReadyPromise = (async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported in this browser.");
    }

    const registration = await navigator.serviceWorker.register(`/sw.js?v=${ASSET_VERSION}`, {
      scope: "/",
      updateViaCache: "none"
    });
    console.info("[proxy:init] Service worker registered", registration.scope);

    await registration.update();
    await navigator.serviceWorker.ready;
    console.info("[proxy:init] Service worker ready");
  })();

  return swReadyPromise;
}

async function getScramjet() {
  if (window.__scramjetInstance) return window.__scramjetInstance;
  if (scramjetReadyPromise) return scramjetReadyPromise;

  scramjetReadyPromise = (async () => {
    console.info("[proxy:init] Scramjet global", typeof window.$scramjetLoadController === "function");
    if (typeof window.$scramjetLoadController !== "function") {
      throw new Error("Scramjet controller unavailable.");
    }

    const { ScramjetController } = window.$scramjetLoadController();
    const scramjet = new ScramjetController({
      files: {
        wasm: `/scram/scramjet.wasm.wasm?v=${ASSET_VERSION}`,
        all: `/scram/scramjet.all.js?v=${ASSET_VERSION}`,
        sync: `/scram/scramjet.sync.js?v=${ASSET_VERSION}`
      }
    });

    await scramjet.init();
    console.info("[proxy:init] Scramjet init complete");
    window.__scramjetInstance = scramjet;
    return scramjet;
  })();

  return scramjetReadyPromise;
}

function resetInitState() {
  swReadyPromise = undefined;
  transportReadyPromise = undefined;
  scramjetReadyPromise = undefined;
  window.__scramjetInstance = undefined;
  scramjetFrame = undefined;
}

async function initScramjet() {
  await ensureTransport();
  await getScramjet();
  await ensureServiceWorker();
}

async function initScramjetWithRecovery() {
  try {
    await initScramjet();
  } catch (error) {
    console.error("Scramjet init failed. Resetting Scramjet storage and retrying once.", error);

    await resetScramjetStorage();

    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }

    resetInitState();
    await initScramjet();
  }
}

async function ensureAppReady() {
  if (!appBootPromise) {
    appBootPromise = initScramjetWithRecovery().catch((error) => {
      showResetProxyError(error);
      throw error;
    });
  }

  return appBootPromise;
}

async function navigate(inputValue) {
  const target = normalizeInput(inputValue);
  if (!target) return;

  await ensureAppReady();

  const scramjet = await getScramjet();
  if (!scramjetFrame) {
    scramjetFrame = scramjet.createFrame(proxyFrame);
  }

  scramjetFrame.go(target);
  const proxiedUrl = scramjetFrame.frame.src;
  proxyFrame.src = proxiedUrl;
  addressInput.value = target;

  hasNavigated = true;
  compactOmnibar();
}

function focusAddressBar(selectAll = true) {
  showOmnibar();
  addressInput.focus({ preventScroll: true });
  if (selectAll) addressInput.select();
}

function showOmnibar() {
  omnibarWrap.classList.add("is-visible");
}

function hideOmnibar() {
  if (!hasNavigated || document.activeElement === addressInput) return;
  omnibarWrap.classList.remove("is-visible");
}

function compactOmnibar() {
  omnibarWrap.classList.remove("is-centered");
  omnibarWrap.classList.add("is-compact", "is-visible");
}

function centeredOmnibar() {
  omnibarWrap.classList.add("is-centered", "is-visible");
  omnibarWrap.classList.remove("is-compact");
}

navForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await navigate(addressInput.value);
  } catch (error) {
    console.error(error);
    addressInput.value = "";
    addressInput.placeholder = "Unable to start proxy. Check console.";
    focusAddressBar(false);
  }
});

addressInput.addEventListener("focus", () => addressInput.select());

window.addEventListener("keydown", (event) => {
  const cmdOrCtrl = event.metaKey || event.ctrlKey;

  if (cmdOrCtrl && event.key.toLowerCase() === "l") {
    event.preventDefault();
    focusAddressBar(true);
    return;
  }

  if (event.key === "Escape" && document.activeElement === addressInput) {
    addressInput.blur();
  }
});

window.addEventListener(
  "wheel",
  (event) => {
    if (!hasNavigated) return;

    if (event.deltaY > 10) {
      hideOmnibar();
    } else if (event.deltaY < -6) {
      showOmnibar();
    }
  },
  { passive: true }
);

window.addEventListener("scroll", () => {
  const y = window.scrollY || 0;
  if (y < lastScrollY) showOmnibar();
  lastScrollY = y;
});

window.addEventListener("mousemove", (event) => {
  if (event.clientY < 72) {
    showOmnibar();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideOmnibar(), 1800);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  centeredOmnibar();
  focusAddressBar(false);

  ensureAppReady().catch(() => {
    addressInput.placeholder = "Proxy initialization failed. Use Reset proxy storage.";
  });
});
