const WISP_PATH = "/wisp/";
const ASSET_VERSION = "scramjet-7";
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
const toggleArrow = document.getElementById("toggleArrow");
const navForm = document.getElementById("navForm");
const addressInput = document.getElementById("addressInput");
const proxyFrame = document.getElementById("proxyFrame");
const engineRow = document.getElementById("engineRow");
const toggleCustomEditorBtn = document.getElementById("toggleCustomEditor");
const customEngineEditor = document.getElementById("customEngineEditor");
const customEngineName = document.getElementById("customEngineName");
const customEngineTemplate = document.getElementById("customEngineTemplate");
const customEditorError = document.getElementById("customEditorError");
const cancelCustomEditorBtn = document.getElementById("cancelCustomEditor");
const resetPanel = document.getElementById("resetPanel");
const retryInitBtn = document.getElementById("retryInitBtn");
const resetProxyStorageBtn = document.getElementById("resetProxyStorageBtn");

let swReadyPromise;
let transportReadyPromise;
let scramjetReadyPromise;
let appBootPromise;
let scramjetFrame;
let isSpotlightOpen = true;
let selectedEngineId = "google";
let hasInitRetried = false;
let navToken = 0;
let chipFocusIndex = -1;

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
      if (typeof parsed.defaultEngineId === "string") engineState.defaultEngineId = parsed.defaultEngineId;
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
      JSON.stringify({ defaultEngineId: engineState.defaultEngineId, custom: engineState.custom })
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

function renderEngineChips() {
  engineRow.textContent = "";
  const engines = getEngines();

  for (const engine of engines) {
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
      if (addressInput.value.trim()) {
        void navigate(addressInput.value, engine.template);
      }
    });

    if (engine.id.startsWith("custom-")) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = " ×";
      removeBtn.setAttribute("aria-label", `Delete ${engine.name}`);
      removeBtn.style.cssText = "margin-left:4px;border:0;background:none;color:inherit;cursor:pointer;";
      removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteCustomEngine(engine.id);
      });
      chip.appendChild(removeBtn);
    }

    engineRow.appendChild(chip);
  }
}

function validateEngineInput(name, template) {
  if (!name.trim()) return "Name is required.";
  if (!template.startsWith("https://")) return "Template must start with https://.";
  if (!template.includes("{query}")) return "Template must include {query}.";

  const duplicate = getEngines().some((engine) => engine.name.toLowerCase() === name.trim().toLowerCase());
  if (duplicate) return "Engine name already exists.";

  return "";
}

function openCustomEditor() {
  customEngineEditor.hidden = false;
  customEditorError.textContent = "";
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

function normalizeInput(raw, engineTemplate) {
  const value = raw.trim();
  if (!value) throw new Error("Enter a URL or search query.");

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
  if (swReadyPromise) return swReadyPromise;

  swReadyPromise = (async () => {
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

  return swReadyPromise;
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

function resetInitState() {
  swReadyPromise = undefined;
  transportReadyPromise = undefined;
  scramjetReadyPromise = undefined;
  appBootPromise = undefined;
  scramjetFrame = undefined;
  window.__scramjetInstance = undefined;
}

async function initScramjet() {
  await ensureTransport();
  await getScramjet();
  await ensureServiceWorker();
}

async function ensureAppReady() {
  if (!appBootPromise) {
    appBootPromise = initScramjet().catch(async (error) => {
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

  return appBootPromise;
}

async function navigate(inputValue, engineTemplate = getEngineById(selectedEngineId).template) {
  const token = ++navToken;
  const t0 = performance.now();
  const target = normalizeInput(inputValue, engineTemplate);

  await ensureAppReady();
  if (token !== navToken) return;

  const scramjet = await getScramjet();
  if (!scramjetFrame) {
    scramjetFrame = scramjet.createFrame(proxyFrame);
  }

  scramjetFrame.go(target);
  const proxiedUrl = scramjetFrame.frame.src;
  proxyFrame.src = proxiedUrl;
  addressInput.value = target;
  devLog(`[perf] Navigation ${(performance.now() - t0).toFixed(1)}ms`, target);
}

function setSpotlightOpen(open, focusInput = false) {
  isSpotlightOpen = open;
  spotlightShell.classList.toggle("is-open", open);
  toggleArrow.textContent = open ? "↑" : "↓";
  spotlightToggle.setAttribute("aria-expanded", String(open));

  if (open && focusInput) {
    addressInput.focus({ preventScroll: true });
    addressInput.select();
  }
}

function moveChipFocus(step) {
  const chips = Array.from(engineRow.querySelectorAll(".engine-chip"));
  if (!chips.length) return;

  chipFocusIndex = chipFocusIndex < 0 ? 0 : (chipFocusIndex + step + chips.length) % chips.length;
  chips[chipFocusIndex].focus();
}

function handleGlobalKeys(event) {
  const cmdOrCtrl = event.metaKey || event.ctrlKey;
  if (cmdOrCtrl && event.key.toLowerCase() === "l") {
    event.preventDefault();
    setSpotlightOpen(true, true);
    return;
  }

  const isInputFocused = document.activeElement === addressInput;
  if (event.key === "ArrowDown") {
    if (!isInputFocused || addressInput.value.trim() === "") {
      event.preventDefault();
      setSpotlightOpen(true, true);
    }
    return;
  }

  if (event.key === "ArrowUp") {
    if (!isInputFocused || addressInput.value.trim() === "") {
      event.preventDefault();
      setSpotlightOpen(false, false);
    }
    return;
  }

  if (event.key === "Escape") {
    if (document.activeElement === addressInput && addressInput.value.trim()) {
      addressInput.blur();
      return;
    }

    if (document.activeElement === addressInput || isSpotlightOpen) {
      setSpotlightOpen(false, false);
      addressInput.blur();
    }
  }
}

function bindEvents() {
  spotlightToggle.addEventListener("click", () => {
    setSpotlightOpen(!isSpotlightOpen, isSpotlightOpen === false);
  });

  navForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await navigate(addressInput.value);
      setSpotlightOpen(false, false);
    } catch (error) {
      console.error(error);
      addressInput.placeholder = "Unable to start proxy.";
      setSpotlightOpen(true, true);
    }
  });

  addressInput.addEventListener("focus", () => {
    setSpotlightOpen(true, false);
  });

  addressInput.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      moveChipFocus(1);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      chipFocusIndex = -1;
    }
  });

  toggleCustomEditorBtn.addEventListener("click", () => {
    if (customEngineEditor.hidden) {
      openCustomEditor();
    } else {
      closeCustomEditor();
    }
  });

  cancelCustomEditorBtn.addEventListener("click", () => closeCustomEditor());

  customEngineEditor.addEventListener("submit", (event) => {
    event.preventDefault();
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
  });

  retryInitBtn.addEventListener("click", async () => {
    try {
      resetPanel.hidden = true;
      resetInitState();
      await ensureAppReady();
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

  window.addEventListener("keydown", handleGlobalKeys, { passive: false });
}

async function boot() {
  parseEngineStorage();
  selectedEngineId = getEngineById(engineState.defaultEngineId).id;
  renderEngineChips();
  bindEvents();

  try {
    await ensureAppReady();
  } catch (error) {
    console.error("Startup failed.", error);
    resetPanel.hidden = false;
  }
}

void boot();
