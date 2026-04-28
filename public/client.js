const WISP_PATH = "/wisp/";

const omnibarWrap = document.getElementById("omnibarWrap");
const navForm = document.getElementById("navForm");
const addressInput = document.getElementById("addressInput");
const proxyFrame = document.getElementById("proxyFrame");

let swReadyPromise;
let transportReadyPromise;
let scramjetReadyPromise;
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

async function ensureTransport() {
  if (transportReadyPromise) return transportReadyPromise;

  transportReadyPromise = (async () => {
    if (!window.BareMux?.BareMuxConnection) {
      throw new Error("BareMux runtime missing.");
    }

    const conn = new window.BareMux.BareMuxConnection("/baremux/worker.js");
    const wispUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host +
      WISP_PATH;

    await conn.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
  })();

  return transportReadyPromise;
}

async function ensureServiceWorker() {
  if (swReadyPromise) return swReadyPromise;

  swReadyPromise = (async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported in this browser.");
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none"
    });

    await registration.update();
    await navigator.serviceWorker.ready;
  })();

  return swReadyPromise;
}

async function getScramjet() {
  if (window.__scramjetInstance) {
    return window.__scramjetInstance;
  }

  if (scramjetReadyPromise) {
    return scramjetReadyPromise;
  }

  scramjetReadyPromise = (async () => {
    if (typeof window.$scramjetLoadController !== "function") {
      throw new Error("Scramjet controller bundle is unavailable. Check /scram/scramjet.all.js.");
    }

    const { ScramjetController } = window.$scramjetLoadController();
    const scramjet = new ScramjetController({
      files: {
        wasm: "/scram/scramjet.wasm.wasm",
        all: "/scram/scramjet.all.js",
        sync: "/scram/scramjet.sync.js"
      }
    });

    await scramjet.init();
    window.__scramjetInstance = scramjet;

    return scramjet;
  })();

  return scramjetReadyPromise;
}

async function encodeScramjetUrl(url) {
  const scramjet = await getScramjet();
  return scramjet.encodeUrl(url);
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

async function navigate(inputValue) {
  const target = normalizeInput(inputValue);
  if (!target) return;

  await ensureTransport();
  await ensureServiceWorker();

  const proxied = await encodeScramjetUrl(target);
  proxyFrame.src = proxied;
  addressInput.value = target;

  hasNavigated = true;
  compactOmnibar();
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

window.addEventListener("load", () => {
  centeredOmnibar();
  focusAddressBar(false);
});
