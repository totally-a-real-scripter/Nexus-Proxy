const WISP_PATH = "/wisp/";
const ASSET_VERSION = "scramjet-9";
const STORAGE_KEY = "proxy.searchEngines.v1";
const DEV =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.search.includes("debug=1");

const SCRAMJET_DB_NAMES = ["$scramjet", "scramjet", "bare-mux", "baremux", "epoxy", "proxy-transports"];
const SCRAMJET_STORAGE_KEYS = ["scramjet", "$scramjet", "bare-mux-path", "baremux"];

const BUILTIN_ENGINES = [
  { id: "google", name: "Google", template: "https://www.google.com/search?q={query}" },
  { id: "youtube", name: "YouTube", template: "https://www.youtube.com/results?search_query={query}" },
  { id: "duckduckgo", name: "DuckDuckGo", template: "https://duckduckgo.com/?q={query}" },
  { id: "github", name: "GitHub", template: "https://github.com/search?q={query}" },
  { id: "reddit", name: "Reddit", template: "https://www.reddit.com/search/?q={query}" },
  { id: "wikipedia", name: "Wikipedia", template: "https://en.wikipedia.org/wiki/Special:Search?search={query}" }
];

const spotlightShell = document.getElementById("spotlightShell");
const spotlightToggle = document.getElementById("spotlightToggle");
const searchForm = document.getElementById("searchForm");
const urlInput = document.getElementById("urlInput");
const clearInput = document.getElementById("clearInput");
const proxyFrame = document.getElementById("proxyFrame");
const engineRow = document.getElementById("engineRow");
const customEngineEditor = document.getElementById("customEngineEditor");
const customEngineName = document.getElementById("customEngineName");
const customEngineTemplate = document.getElementById("customEngineTemplate");
const customEditorError = document.getElementById("customEditorError");
const cancelCustomEditorBtn = document.getElementById("cancelCustomEditor");
const saveCustomEngineBtn = document.getElementById("saveCustomEngine");
const resetPanel = document.getElementById("resetPanel");
const retryInitBtn = document.getElementById("retryInitBtn");
const resetProxyStorageBtn = document.getElementById("resetProxyStorageBtn");
const requiredElements = {
  spotlightShell,
  searchForm,
  urlInput,
  proxyFrame,
  engineRow,
  spotlightToggle,
  clearInput
};

for (const [name, element] of Object.entries(requiredElements)) {
  if (!element) {
    console.error(`[ui] Missing required element: ${name}`);
  }
}

if (spotlightShell) {
  spotlightShell.classList.remove("is-hidden");
  spotlightShell.classList.add("is-open");
}

let collapseTimer = null;
let proxyReadyPromise = null;
let serviceWorkerReadyPromise = null;
let transportReadyPromise = null;
let scramjetReadyPromise = null;
let hasBoundEvents = false;
let hasInitRetried = false;
let navToken = 0;
let selectedEngineId = "google";
let revealQueued = false;
let scramjetFrame = null;

const engineState = {
  defaultEngineId: "google",
  custom: []
};

function devLog(...args) {
  if (DEV) console.info(...args);
}

function parseEngineStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.defaultEngineId === "string") {
        engineState.defaultEngineId = parsed.defaultEngineId;
      }

      if (Array.isArray(parsed.custom)) {
        engineState.custom = parsed.custom.filter(
          (engine) =>
            engine &&
            typeof engine.id === "string" &&
            typeof engine.name === "string" &&
            typeof engine.template === "string"
        );
      }
    }
  } catch (error) {
    console.warn("Unable to parse search engine storage.", error);
  }
}

function persistEngineState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        defaultEngineId: engineState.defaultEngineId,
        custom: engineState.custom
      })
    );
  } catch (error) {
    console.warn("Unable to save search engine settings.", error);
  }
}

function getEngines() {
  return [...BUILTIN_ENGINES, ...engineState.custom];
}

function getEngineById(id) {
  return getEngines().find((engine) => engine.id === id) || BUILTIN_ENGINES[0];
}

function syncSpotlightState() {
  const hasValue = !!urlInput.value.trim();
  spotlightShell.classList.toggle("has-value", hasValue);
  spotlightShell.classList.toggle("is-typing", hasValue);
}

function openSpotlight({ focus = true } = {}) {
  clearTimeout(collapseTimer);
  spotlightShell.classList.remove("is-hidden", "is-collapsed");
  spotlightShell.classList.add("is-open");
  spotlightToggle.setAttribute("aria-expanded", "true");

  if (focus) {
    requestAnimationFrame(() => {
      urlInput.focus({ preventScroll: true });
      urlInput.select();
    });
  }
}

function closeSpotlight({ force = false } = {}) {
  if (!force && urlInput.value.trim()) return;

  spotlightShell.classList.remove("is-open", "is-focused", "is-typing");
  spotlightShell.classList.add("is-collapsed");
  spotlightToggle.setAttribute("aria-expanded", "false");
  urlInput.blur();
}

function scheduleCollapse() {
  clearTimeout(collapseTimer);

  collapseTimer = setTimeout(() => {
    if (document.activeElement !== urlInput && !urlInput.value.trim()) {
      closeSpotlight({ force: true });
    }
  }, 2000);
}

function initUI() {
  spotlightShell.classList.remove("is-hidden", "is-collapsed");
  spotlightShell.classList.add("is-open");
  spotlightToggle.setAttribute("aria-expanded", "true");
  syncSpotlightState();

  requestAnimationFrame(() => {
    urlInput.focus({ preventScroll: true });
  });
}

function openCustomEditor() {
  customEngineEditor.hidden = false;
  customEditorError.textContent = "";
  openSpotlight({ focus: false });
  customEngineName.focus({ preventScroll: true });
}

function closeCustomEditor() {
  customEngineEditor.hidden = true;
  customEditorError.textContent = "";
  customEngineName.value = "";
  customEngineTemplate.value = "";
}

function deleteCustomEngine(engineId) {
  engineState.custom = engineState.custom.filter((engine) => engine.id !== engineId);

  if (selectedEngineId === engineId) {
    selectedEngineId = "google";
    engineState.defaultEngineId = "google";
  }

  persistEngineState();
  renderEngineChips();
}

function renderEngineChips() {
  engineRow.textContent = "";

  for (const engine of getEngines()) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "engine-chip";
    chip.dataset.engineId = engine.id;
    chip.textContent = engine.name;

    if (engine.id === selectedEngineId) {
      chip.classList.add("active");
      chip.setAttribute("aria-current", "true");
    }

    chip.addEventListener("click", () => {
      selectedEngineId = engine.id;
      engineState.defaultEngineId = engine.id;
      persistEngineState();
      renderEngineChips();
      if (urlInput.value.trim()) {
        void navigate(urlInput.value, engine.template);
      }
    });

    if (engine.id.startsWith("custom-")) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "engine-chip engine-delete";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", `Delete ${engine.name}`);
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteCustomEngine(engine.id);
      });
      chip.appendChild(removeBtn);
    }

    engineRow.appendChild(chip);
  }

  const addChip = document.createElement("button");
  addChip.type = "button";
  addChip.className = "engine-chip engine-add";
  addChip.textContent = "+ Add";
  addChip.setAttribute("aria-label", "Add custom search engine");
  addChip.addEventListener("click", openCustomEditor);
  engineRow.appendChild(addChip);
}

function validateEngineInput(name, template) {
  if (!name.trim()) return "Name is required.";
  if (!template.startsWith("https://")) return "Template must start with https://.";
  if (!template.includes("{query}")) return "Template must include {query}.";

  const duplicate = getEngines().some((engine) => engine.name.toLowerCase() === name.trim().toLowerCase());
  if (duplicate) return "Engine name already exists.";

  return "";
}

function normalizeInput(raw, engineTemplate) {
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

  return engineTemplate.replace("{query}", encodeURIComponent(value));
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

  localStorage.clear();
  sessionStorage.clear();

  window.location.href = `/reset?from=client&v=${ASSET_VERSION}`;
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

    const t0 = performance.now();
    const { ScramjetController } = window.$scramjetLoadController();
    const scramjet = new ScramjetController({
      files: {
        wasm: `/scram/scramjet.wasm.wasm?v=${ASSET_VERSION}`,
        all: `/scram/scramjet.all.js?v=${ASSET_VERSION}`,
        sync: `/scram/scramjet.sync.js?v=${ASSET_VERSION}`
      }
    });

    await scramjet.init();
    devLog(`[perf] Scramjet init ${(performance.now() - t0).toFixed(1)}ms`);
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

function resetInitState() {
  serviceWorkerReadyPromise = null;
  transportReadyPromise = null;
  scramjetReadyPromise = null;
  proxyReadyPromise = null;
  scramjetFrame = null;
  window.__scramjetInstance = undefined;
}

async function ensureProxyReady() {
  if (!proxyReadyPromise) {
    proxyReadyPromise = initScramjet().catch(async (error) => {
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

  return proxyReadyPromise;
}

async function navigate(inputValue, engineTemplate = getEngineById(selectedEngineId).template) {
  const token = ++navToken;
  const t0 = performance.now();
  const target = normalizeInput(inputValue, engineTemplate);

  await ensureProxyReady();
  if (token !== navToken) return;

  const scramjet = await getScramjet();
  if (!scramjetFrame) {
    scramjetFrame = scramjet.createFrame(proxyFrame);
  }

  scramjetFrame.go(target);
  const proxiedUrl = scramjetFrame.frame.src;
  proxyFrame.src = proxiedUrl;

  urlInput.value = inputValue.trim();
  syncSpotlightState();
  devLog(`[perf] Navigation ${(performance.now() - t0).toFixed(1)}ms`, target);
}

function handleGlobalKeys(event) {
  const cmdOrCtrl = event.metaKey || event.ctrlKey;

  if (cmdOrCtrl && event.key.toLowerCase() === "l") {
    event.preventDefault();
    openSpotlight({ focus: true });
    return;
  }

  if (event.key === "Escape") {
    if (urlInput.value.trim()) {
      urlInput.value = "";
      syncSpotlightState();
      return;
    }

    closeSpotlight({ force: true });
    return;
  }

  if (event.key === "ArrowDown") {
    const isInputFocused = document.activeElement === urlInput;
    if (!isInputFocused || !spotlightShell.classList.contains("is-open")) {
      event.preventDefault();
      openSpotlight({ focus: true });
    }
    return;
  }

  if (event.key === "ArrowUp") {
    const isInputFocused = document.activeElement === urlInput;
    if (!isInputFocused || !urlInput.value.trim()) {
      event.preventDefault();
      closeSpotlight({ force: true });
    }
  }
}

function onMouseMove(event) {
  if (event.clientY > 72 || !spotlightShell.classList.contains("is-hidden") || revealQueued) return;

  revealQueued = true;
  requestAnimationFrame(() => {
    revealQueued = false;
    spotlightShell.classList.remove("is-hidden");
  });
}

function bindEvents() {
  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (event.submitter === saveCustomEngineBtn) {
      const name = customEngineName.value.trim();
      const template = customEngineTemplate.value.trim();
      const validationError = validateEngineInput(name, template);

      if (validationError) {
        customEditorError.textContent = validationError;
        return;
      }

      const entry = {
        id: `custom-${Date.now()}`,
        name,
        template
      };

      engineState.custom.push(entry);
      engineState.defaultEngineId = entry.id;
      selectedEngineId = entry.id;
      persistEngineState();
      renderEngineChips();
      closeCustomEditor();
      urlInput.focus({ preventScroll: true });
      return;
    }

    try {
      await navigate(urlInput.value);
      if (!urlInput.value.trim()) {
        scheduleCollapse();
      }
    } catch (error) {
      console.error(error);
      urlInput.placeholder = "Unable to start proxy.";
      openSpotlight({ focus: true });
    }
  });

  spotlightToggle.addEventListener("click", () => {
    const openLike =
      spotlightShell.classList.contains("is-open") ||
      spotlightShell.classList.contains("is-focused") ||
      spotlightShell.classList.contains("is-typing");

    if (openLike && !urlInput.value.trim()) {
      closeSpotlight({ force: true });
      return;
    }

    spotlightShell.classList.remove("is-hidden");
    openSpotlight({ focus: true });
  });

  urlInput.addEventListener("focus", () => {
    openSpotlight({ focus: false });
    spotlightShell.classList.add("is-focused");
    urlInput.select();
  });

  urlInput.addEventListener("blur", () => {
    spotlightShell.classList.remove("is-focused");
    scheduleCollapse();
  });

  urlInput.addEventListener("input", () => {
    openSpotlight({ focus: false });
    syncSpotlightState();
  });

  clearInput.addEventListener("click", () => {
    urlInput.value = "";
    syncSpotlightState();
    openSpotlight({ focus: true });
  });

  cancelCustomEditorBtn.addEventListener("click", () => {
    closeCustomEditor();
    urlInput.focus({ preventScroll: true });
  });

  retryInitBtn.addEventListener("click", async () => {
    try {
      resetPanel.hidden = true;
      resetInitState();
      await ensureProxyReady();
    } catch (error) {
      console.error(error);
      resetPanel.hidden = false;
    }
  });

  resetProxyStorageBtn.addEventListener("click", async () => {
    try {
      await hardResetProxyStorage();
    } catch (error) {
      console.error("Hard reset failed.", error);
    }
  });

  document.addEventListener("keydown", handleGlobalKeys, { passive: false });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
}

async function boot() {
  parseEngineStorage();
  selectedEngineId = getEngineById(engineState.defaultEngineId).id;
  engineState.defaultEngineId = selectedEngineId;
  renderEngineChips();
  syncSpotlightState();

  if (!hasBoundEvents) {
    bindEvents();
    hasBoundEvents = true;
  }

  initUI();

  try {
    await ensureProxyReady();
  } catch (error) {
    console.error("Startup failed.", error);
    resetPanel.hidden = false;
  }
}

void boot();
