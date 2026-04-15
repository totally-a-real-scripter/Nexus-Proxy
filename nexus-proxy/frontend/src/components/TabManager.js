/**
 * TabManager
 * Manages multiple proxy browsing sessions.
 * Each tab = one <iframe> with its own navigation history stack.
 *
 * UV encodes URLs like: /service/[xor-encoded-url]
 * Scramjet encodes:     /scram/[base64-encoded-url]
 */

import { $, on } from "../utils/dom.js";

const UV_PREFIX      = window.__UV_PREFIX__      || "/service/";
const SCRAMJET_PREFIX = window.__SCRAMJET_PREFIX__ || "/scram/";

let tabIdCounter = 0;

function newId() { return ++tabIdCounter; }

export class TabManager {
  constructor(transport) {
    this.transport  = transport;
    this.tabs       = [];          // { id, title, url, iframe, history[], histIdx }
    this.activeId   = null;
    this.engine     = "uv";        // "uv" | "scramjet"
    this.onUrlChange = null;

    this._tabBar    = document.getElementById("tabBar");
    this._newTabBtn = document.getElementById("newTabBtn");
    this._frameWrap = document.getElementById("browserFrameWrap");
    this._homePage  = document.getElementById("homePage");
    this._loading   = document.getElementById("browserLoading");

    on(this._newTabBtn, "click", () => this.newTab());

    // Open an initial blank tab
    this.newTab();
  }

  // ── Engine selection ───────────────────────────────────────────────────────
  setEngine(engine) {
    this.engine = engine;
  }

  // ── Encode URL through selected proxy engine ───────────────────────────────
  encodeUrl(url) {
    if (this.engine === "scramjet") {
      // Scramjet codec: btoa with padding stripped
      return SCRAMJET_PREFIX + btoa(url).replace(/=/g, "");
    }
    // Ultraviolet codec: XOR encoding via uv.bundle.js (loaded globally)
    if (window.__uv$config?.encodeUrl) {
      return UV_PREFIX + window.__uv$config.encodeUrl(url);
    }
    // Fallback: plain base64
    return UV_PREFIX + btoa(url);
  }

  // ── Create a new tab ───────────────────────────────────────────────────────
  newTab(url = null) {
    const id = newId();
    const iframe = document.createElement("iframe");
    iframe.className = "browser-frame";
    iframe.id        = `frame-${id}`;
    iframe.setAttribute("sandbox",
      "allow-forms allow-modals allow-orientation-lock allow-pointer-lock " +
      "allow-popups allow-presentation allow-scripts allow-same-origin"
    );
    iframe.setAttribute("allow", "fullscreen");
    iframe.style.display = "none";

    // Listen for title changes via postMessage from the SW-rewritten page
    window.addEventListener("message", (e) => {
      if (e.data?.nexusTabId === id && e.data?.type === "titleChange") {
        this._updateTabTitle(id, e.data.title);
      }
    });

    const tab = {
      id,
      title:   "New Tab",
      url:     url || "",
      iframe,
      history: [],
      histIdx: -1,
    };

    this.tabs.push(tab);
    this._frameWrap.appendChild(iframe);
    this._renderTabBar();
    this.setActive(id);

    if (url) this.navigate(url, id);
    return id;
  }

  // ── Close a tab ────────────────────────────────────────────────────────────
  closeTab(id) {
    const idx  = this.tabs.findIndex(t => t.id === id);
    if (idx === -1) return;

    const tab = this.tabs[idx];
    tab.iframe.remove();
    this.tabs.splice(idx, 1);

    if (this.tabs.length === 0) {
      this.newTab();
      return;
    }

    const nextIdx = Math.min(idx, this.tabs.length - 1);
    this.setActive(this.tabs[nextIdx].id);
    this._renderTabBar();
  }

  // ── Activate a tab ────────────────────────────────────────────────────────
  setActive(id) {
    this.activeId = id;

    // Show correct iframe, hide others
    this.tabs.forEach(tab => {
      tab.iframe.style.display = (tab.id === id) ? "block" : "none";
    });

    const active = this._getTab(id);
    if (!active) return;

    const hasUrl = !!active.url;
    this._homePage.style.display   = hasUrl ? "none"  : "flex";
    this._frameWrap.style.display  = hasUrl ? "block" : "none";

    if (this.onUrlChange) this.onUrlChange(active.url || "");
    this._renderTabBar();
  }

  // ── Navigate the active (or specified) tab ────────────────────────────────
  navigate(url, tabId = null) {
    const id  = tabId || this.activeId;
    const tab = this._getTab(id);
    if (!tab) return;

    tab.url   = url;
    tab.title = this._hostnameOf(url);

    // Push to history stack
    if (tab.histIdx < tab.history.length - 1) {
      tab.history = tab.history.slice(0, tab.histIdx + 1);
    }
    tab.history.push(url);
    tab.histIdx = tab.history.length - 1;

    // Show frame, hide home
    this._homePage.style.display  = "none";
    this._frameWrap.style.display = "block";
    tab.iframe.style.display      = "block";

    // Show loading indicator
    this._loading.classList.add("active");
    tab.iframe.onload = () => this._loading.classList.remove("active");
    setTimeout(() => this._loading.classList.remove("active"), 8000);

    const proxied = this.encodeUrl(url);
    tab.iframe.src = proxied;

    if (this.onUrlChange) this.onUrlChange(url);
    this._renderTabBar();
  }

  // ── Navigation controls ───────────────────────────────────────────────────
  back() {
    const tab = this._activeTab();
    if (!tab || tab.histIdx <= 0) return;
    tab.histIdx--;
    tab.url = tab.history[tab.histIdx];
    tab.iframe.src = this.encodeUrl(tab.url);
    if (this.onUrlChange) this.onUrlChange(tab.url);
  }

  forward() {
    const tab = this._activeTab();
    if (!tab || tab.histIdx >= tab.history.length - 1) return;
    tab.histIdx++;
    tab.url = tab.history[tab.histIdx];
    tab.iframe.src = this.encodeUrl(tab.url);
    if (this.onUrlChange) this.onUrlChange(tab.url);
  }

  reload() {
    const tab = this._activeTab();
    if (!tab || !tab.url) return;
    tab.iframe.src = this.encodeUrl(tab.url);
  }

  toggleMobile() {
    const tab = this._activeTab();
    if (!tab) return;
    const wrap = this._frameWrap;
    const isMobile = wrap.dataset.mobile === "1";
    if (isMobile) {
      wrap.dataset.mobile = "0";
      Object.assign(wrap.style, { maxWidth: "", margin: "", border: "" });
    } else {
      wrap.dataset.mobile = "1";
      Object.assign(wrap.style, {
        maxWidth: "390px",
        margin: "0 auto",
        border: "1px solid var(--border)",
        borderTop: "none",
      });
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────
  _getTab(id)     { return this.tabs.find(t => t.id === id) || null; }
  _activeTab()    { return this._getTab(this.activeId); }
  _hostnameOf(u)  { try { return new URL(u).hostname; } catch { return u; } }

  _updateTabTitle(id, title) {
    const tab = this._getTab(id);
    if (!tab) return;
    tab.title = title || tab.title;
    this._renderTabBar();
  }

  // ── Render tab bar DOM ────────────────────────────────────────────────────
  _renderTabBar() {
    const bar = this._tabBar;
    const newBtn = document.getElementById("newTabBtn");

    // Remove old tab elements (keep the + button)
    bar.querySelectorAll(".tab").forEach(el => el.remove());

    this.tabs.forEach(tab => {
      const el = document.createElement("div");
      el.className = "tab" + (tab.id === this.activeId ? " active" : "");
      el.dataset.id = tab.id;

      // Favicon using Google's public favicon service
      const faviconUrl = tab.url
        ? `https://www.google.com/s2/favicons?domain=${this._hostnameOf(tab.url)}&sz=16`
        : "";

      el.innerHTML = `
        ${faviconUrl ? `<img src="${faviconUrl}" width="14" height="14" style="border-radius:2px;flex-shrink:0" onerror="this.style.display='none'" />` : "🌐"}
        <span class="tab-title">${this._escape(tab.title)}</span>
        <span class="tab-close" data-close="${tab.id}">✕</span>
      `;

      on(el, "click", (e) => {
        if (e.target.dataset.close) {
          e.stopPropagation();
          this.closeTab(parseInt(e.target.dataset.close));
        } else {
          this.setActive(tab.id);
        }
      });

      bar.insertBefore(el, newBtn);
    });
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
