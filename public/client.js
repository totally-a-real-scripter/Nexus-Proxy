const WISP_PATH = "/wisp/";
const ASSET_VERSION = "scramjet-13";

const SCRAMJET_DB_NAMES = ["$scramjet", "scramjet", "bare-mux", "baremux", "epoxy", "gateway-transports"];
const SCRAMJET_STORAGE_KEYS = ["scramjet", "$scramjet", "bare-mux-path", "baremux"];

const spotlightShell = document.getElementById("spotlightShell");
const searchForm = document.getElementById("searchForm");
const urlInput = document.getElementById("urlInput");
const contentFrame = document.getElementById("contentFrame");
const clearInput = document.getElementById("clearInput");
const bottomBar = document.getElementById("bottomBar");
const homeButton = document.getElementById("homeButton");
const collapseButton = document.getElementById("collapseButton");
const resetPanel = document.getElementById("resetPanel");
const retryInitBtn = document.getElementById("retryInitBtn");
const resetStorageBtn = document.getElementById("resetStorageBtn");

const requiredElements = {
  spotlightShell,
  searchForm,
  urlInput,
  contentFrame,
  clearInput,
  bottomBar,
  homeButton,
  collapseButton
};

for (const [name, element] of Object.entries(requiredElements)) {
  if (!element) {
    console.error(`[ui] Missing required element: ${name}`);
  }
}

let collapseTimer = null;
let hasBoundEvents = false;
let gatewayReadyPromise = null;
let serviceWorkerReadyPromise = null;
let transportReadyPromise = null;
let scramjetReadyPromise = null;
let hasInitRetried = false;
let hasLoadedContent = false;

function normalizeInput(raw) {
  const value = raw.trim();

  if (!value) {
    throw new Error("Enter a URL or search query.");
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return new URL(value).href;
  }

  if (value.includes(".") && !/\s/.test(value)) {
    return new URL(`https://${value}`).href;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function syncSpotlightState() {
  const hasValue = !!urlInput.value.trim();

  spotlightShell.classList.toggle("has-value", hasValue);
  spotlightShell.classList.toggle("is-typing", hasValue && !spotlightShell.classList.contains("is-condensed"));
}

function expandSpotlight({ focus = true } = {}) {
  clearTimeout(collapseTimer);
  spotlightShell.classList.remove("is-hidden", "is-condensed");
  spotlightShell.classList.add("is-open");

  if (focus) {
    requestAnimationFrame(() => {
      urlInput.focus();
      urlInput.select();
    });
  }
}

function condenseSpotlight() {
  clearTimeout(collapseTimer);
  spotlightShell.classList.remove("is-open", "is-focused", "is-typing", "is-hidden");
  spotlightShell.classList.add("is-condensed");
  urlInput.blur();
  syncSpotlightState();
}

function closeSpotlight({ force = false } = {}) {
  if (!force && urlInput.value.trim()) return;

  spotlightShell.classList.remove("is-open", "is-focused", "is-typing", "is-condensed");
  urlInput.blur();
}

function scheduleCollapse() {
  clearTimeout(collapseTimer);

  collapseTimer = setTimeout(() => {
    if (document.activeElement !== urlInput && !urlInput.value.trim()) {
      if (hasLoadedContent) {
        condenseSpotlight();
      } else {
        closeSpotlight({ force: true });
      }
    }
  }, 2000);
}

function clearScramjetStorageKeys() {
  for (const key of SCRAMJET_STORAGE_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
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

async function resetScramjetStorage() {
  for (const name of SCRAMJET_DB_NAMES) {
    await deleteDatabase(name);
  }

  clearScramjetStorageKeys();
}

function resetInitState() {
  serviceWorkerReadyPromise = null;
  transportReadyPromise = null;
  scramjetReadyPromise = null;
  gatewayReadyPromise = null;
  window.__scramjetInstance = undefined;
}

async function ensureTransport() {
  if (transportReadyPromise) return transportReadyPromise;

  transportReadyPromise = (async () => {
    if (!window.BareMux?.BareMuxConnection) {
      throw new Error("BareMux runtime missing.");
    }

    const conn = new window.BareMux.BareMuxConnection(`/baremux/worker.js?v=${ASSET_VERSION}`);
    const wispUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + WISP_PATH;

    await conn.setTransport(`/epoxy/index.mjs?v=${ASSET_VERSION}`, [{ wisp: wispUrl }]);
  })();

  return transportReadyPromise;
}

async function ensureServiceWorker() {
  if (serviceWorkerReadyPromise) return serviceWorkerReadyPromise;

  serviceWorkerReadyPromise = (async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported.");
    }

    const registration = await navigator.serviceWorker.register(`/sw.js?v=${ASSET_VERSION}`, {
      scope: "/",
      updateViaCache: "none"
    });

    await registration.update();
    await navigator.serviceWorker.ready;
  })();

  return serviceWorkerReadyPromise;
}

async function getScramjet() {
  if (window.__scramjetInstance) return window.__scramjetInstance;
  if (scramjetReadyPromise) return scramjetReadyPromise;

  scramjetReadyPromise = (async () => {
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
    window.__scramjetInstance = scramjet;
    return scramjet;
  })();

  return scramjetReadyPromise;
}

async function initScramjet() {
  await ensureTransport();
  await getScramjet();
  await ensureServiceWorker();
}

async function ensureGatewayReady() {
  if (!gatewayReadyPromise) {
    gatewayReadyPromise = initScramjet().catch(async (error) => {
      if (hasInitRetried) throw error;

      hasInitRetried = true;
      await resetScramjetStorage();

      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }

      resetInitState();
      return initScramjet();
    });
  }

  return gatewayReadyPromise;
}

async function createScramjetUrl(target) {
  await ensureGatewayReady();
  const scramjet = await getScramjet();
  const frame = scramjet.createFrame(contentFrame);
  frame.go(target);
  return frame.frame.src;
}

async function navigate(inputValue) {
  const target = normalizeInput(inputValue);
  const framedUrl = await createScramjetUrl(target);
  contentFrame.src = framedUrl;
  urlInput.value = inputValue.trim();
  syncSpotlightState();
}

function bindUIEvents() {
  if (hasBoundEvents) return;
  hasBoundEvents = true;

  urlInput.addEventListener("focus", () => {
    spotlightShell.classList.remove("is-condensed");
    spotlightShell.classList.add("is-focused", "is-open");
    requestAnimationFrame(() => urlInput.select());
  });

  urlInput.addEventListener("blur", () => {
    spotlightShell.classList.remove("is-focused");
    scheduleCollapse();
  });

  urlInput.addEventListener("input", syncSpotlightState);

  clearInput.addEventListener("click", () => {
    urlInput.value = "";
    syncSpotlightState();
    expandSpotlight({ focus: true });
  });

  homeButton?.addEventListener("click", () => {
    hasLoadedContent = false;
    contentFrame.src = "/home.html";
    urlInput.value = "";
    syncSpotlightState();
    expandSpotlight({ focus: true });
  });

  collapseButton?.addEventListener("click", () => {
    if (hasLoadedContent) {
      condenseSpotlight();
    } else {
      closeSpotlight({ force: true });
    }
  });

  spotlightShell?.addEventListener("click", (event) => {
    if (!spotlightShell.classList.contains("is-condensed")) return;

    event.preventDefault();
    expandSpotlight({ focus: true });
  });


  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await navigate(urlInput.value);
      hasLoadedContent = true;
      condenseSpotlight();
    } catch (error) {
      console.error("[navigate] failed", error);
      expandSpotlight({ focus: true });
    }
  });


  document.addEventListener("keydown", (event) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");

    if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      expandSpotlight({ focus: true });
      return;
    }

    if (event.key === "Escape") {
      if (urlInput.value.trim()) {
        urlInput.value = "";
        syncSpotlightState();
      } else if (hasLoadedContent) {
        condenseSpotlight();
      } else {
        closeSpotlight({ force: true });
      }
      return;
    }

    if (event.key === "ArrowDown") {
      if (
        spotlightShell.classList.contains("is-condensed") ||
        spotlightShell.classList.contains("is-hidden") ||
        document.activeElement !== urlInput
      ) {
        event.preventDefault();
        expandSpotlight({ focus: true });
      }
      return;
    }

    if (event.key === "ArrowUp") {
      if (document.activeElement !== urlInput || !urlInput.value.trim()) {
        event.preventDefault();
        if (!urlInput.value.trim() && hasLoadedContent) {
          condenseSpotlight();
        } else {
          closeSpotlight({ force: true });
        }
      }
    }
  });

  retryInitBtn?.addEventListener("click", async () => {
    try {
      resetPanel.hidden = true;
      resetInitState();
      await ensureGatewayReady();
    } catch (error) {
      console.error(error);
      resetPanel.hidden = false;
    }
  });

  resetStorageBtn?.addEventListener("click", async () => {
    window.location.href = `/reset?from=client&v=${ASSET_VERSION}`;
  });
}

function initUI() {
  hasLoadedContent = false;
  contentFrame.src = "/home.html";
  spotlightShell.classList.remove("is-hidden");
  spotlightShell.classList.add("is-open");
  syncSpotlightState();
  bindUIEvents();

  requestAnimationFrame(() => {
    urlInput.focus();
  });
}

function initGatewayInBackground() {
  ensureGatewayReady().catch((error) => {
    console.error("[gateway] background init failed", error);
    if (resetPanel) resetPanel.hidden = false;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    initUI();
    initGatewayInBackground();
  } catch (error) {
    console.error("[fatal client startup error]", error);
  }
});
