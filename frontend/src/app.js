/**
 * Nexus Proxy — Frontend Application
 * Entry point: bootstraps service workers, renders the app shell,
 * wires up tabs, URL bar, dashboard SSE stream, and config panel.
 *
 * Data flow:
 *   User enters URL → resolve API → UV/Scramjet encode → iframe src update
 *   iframe ↔ service worker ↔ Bare server ↔ Epoxy/Wisp ↔ target site
 */

import { TabManager }     from "./components/TabManager.js";
import { Dashboard }      from "./components/Dashboard.js";
import { ConfigPanel }    from "./components/ConfigPanel.js";
import { HistoryManager } from "./components/HistoryManager.js";
import { registerSW }     from "./utils/serviceWorker.js";
import { initTransport }  from "./utils/transport.js";
import { $, $$, on }      from "./utils/dom.js";
import { icons }          from "./utils/icons.js";

// ─── Boot sequence ────────────────────────────────────────────────────────────
async function boot() {
  // 1. Check disclaimer acceptance
  setupDisclaimer();

  // 2. Register Ultraviolet service worker
  await registerSW();

  // 3. Fetch transport config from backend
  const transport = await initTransport();

  // 4. Render main app shell
  renderShell(transport);

  // 5. Hide splash
  setTimeout(() => {
    $("#splash")?.classList.add("hidden");
  }, 600);
}

// ─── Disclaimer ───────────────────────────────────────────────────────────────
function setupDisclaimer() {
  const overlay = $("#disclaimer");
  if (!overlay) return;

  if (localStorage.getItem("nexus_accepted")) {
    overlay.classList.add("hidden");
    return;
  }

  $("#disclaimerAccept")?.addEventListener("click", () => {
    localStorage.setItem("nexus_accepted", "1");
    overlay.classList.add("hidden");
  });
}

// ─── App Shell ────────────────────────────────────────────────────────────────
function renderShell(transport) {
  const app = $("#app");
  if (!app) return;

  app.innerHTML = `
    <div id="app-shell">
      ${renderSidebar()}
      <div class="main-area">
        ${renderTopBar()}
        ${renderTabBar()}
        ${renderPanels()}
      </div>
    </div>
  `;

  // ── Wire up components ────────────────────────────────────────────────────
  const tabManager     = new TabManager(transport);
  const dashboard      = new Dashboard();
  const configPanel    = new ConfigPanel();
  const historyManager = new HistoryManager();

  // ── Navigation ────────────────────────────────────────────────────────────
  let activeView = "browser";

  function showView(id) {
    activeView = id;
    $$(".panel").forEach(p => p.classList.remove("active"));
    $(`#panel-${id}`)?.classList.add("active");

    $$(".nav-item").forEach(n => {
      n.classList.toggle("active", n.dataset.view === id);
    });
  }

  $$(".nav-item").forEach(item => {
    on(item, "click", () => showView(item.dataset.view));
  });

  // ── URL bar ───────────────────────────────────────────────────────────────
  const urlInput = $("#urlInput");
  const goBtn    = $("#goBtn");

  async function navigate(raw) {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: raw }),
    });
    const { resolved, error } = await res.json();
    if (error || !resolved) return showError("Invalid URL: " + raw);

    showView("browser");
    tabManager.navigate(resolved);
    historyManager.push({ url: resolved, title: resolved, ts: Date.now() });
    urlInput.value = resolved;
  }

  on(goBtn, "click", () => navigate(urlInput.value.trim()));
  on(urlInput, "keydown", e => {
    if (e.key === "Enter") navigate(urlInput.value.trim());
  });

  // ── Home page search ──────────────────────────────────────────────────────
  const homeInput = $("#homeSearchInput");
  const homeGo    = $("#homeGoBtn");
  if (homeInput && homeGo) {
    on(homeGo, "click", () => navigate(homeInput.value.trim()));
    on(homeInput, "keydown", e => {
      if (e.key === "Enter") navigate(homeInput.value.trim());
    });
  }

  // Quick links
  $$(".quick-link[data-url]").forEach(el => {
    on(el, "click", () => navigate(el.dataset.url));
  });

  // ── Tab bar wiring ────────────────────────────────────────────────────────
  tabManager.onUrlChange = (url) => {
    if (urlInput) urlInput.value = url;
  };

  // ── Engine toggle ─────────────────────────────────────────────────────────
  $$(".engine-badge").forEach(badge => {
    on(badge, "click", () => {
      $$(".engine-badge").forEach(b => b.classList.remove("active"));
      badge.classList.add("active");
      tabManager.setEngine(badge.dataset.engine);
    });
  });

  // ── Topbar buttons ────────────────────────────────────────────────────────
  on($("#btnBack"),    "click", () => tabManager.back());
  on($("#btnForward"), "click", () => tabManager.forward());
  on($("#btnRefresh"), "click", () => tabManager.reload());
  on($("#btnMobile"),  "click", () => tabManager.toggleMobile());

  // Show browser panel by default
  showView("browser");
}

// ─── Sidebar HTML ─────────────────────────────────────────────────────────────
function renderSidebar() {
  return `
  <aside class="sidebar">
    <div class="sidebar-logo">
      ${icons.nexus}
      <span>NEXUS</span>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">Browse</div>
      <div class="nav-item active" data-view="browser">
        ${icons.globe} <span>Browser</span>
      </div>
      <div class="nav-item" data-view="history">
        ${icons.history} <span>History</span>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">Monitor</div>
      <div class="nav-item" data-view="dashboard">
        ${icons.chart} <span>Dashboard</span>
      </div>
      <div class="nav-item" data-view="config">
        ${icons.settings} <span>Settings</span>
      </div>
    </div>

    <div class="sidebar-spacer"></div>

    <div class="sidebar-footer">
      <div class="sidebar-status">
        <div class="status-dot"></div>
        <span>Connected</span>
      </div>
      <div style="font-size:10px;color:var(--text-3)">Nexus v1.0 — Use responsibly</div>
    </div>
  </aside>`;
}

// ─── Top bar HTML ─────────────────────────────────────────────────────────────
function renderTopBar() {
  return `
  <div class="topbar">
    <div class="topbar-actions">
      <button class="topbar-btn" id="btnBack"    data-tooltip="Back">←</button>
      <button class="topbar-btn" id="btnForward" data-tooltip="Forward">→</button>
      <button class="topbar-btn" id="btnRefresh" data-tooltip="Refresh">↻</button>
    </div>

    <div class="url-bar-wrap">
      <svg class="url-bar-icon" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 2 Q10.5 5 10.5 8 Q10.5 11 8 14" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 2 Q5.5 5 5.5 8 Q5.5 11 8 14" stroke="currentColor" stroke-width="1.5"/>
        <path d="M2 8h12" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      <input
        type="text"
        id="urlInput"
        class="url-bar"
        placeholder="Enter URL or search..."
        autocomplete="off"
        spellcheck="false"
      />
      <button class="url-bar-go" id="goBtn" title="Go">→</button>
    </div>

    <div style="display:flex;gap:6px;align-items:center">
      <button class="engine-badge active" data-engine="uv"       data-tooltip="Ultraviolet engine">
        <span class="engine-dot"></span>UV
      </button>
      <button class="engine-badge"        data-engine="scramjet" data-tooltip="Scramjet engine">
        <span class="engine-dot"></span>SJ
      </button>
    </div>

    <div class="topbar-actions">
      <button class="topbar-btn" id="btnMobile" data-tooltip="Toggle mobile view">📱</button>
    </div>
  </div>`;
}

// ─── Tab bar HTML ─────────────────────────────────────────────────────────────
function renderTabBar() {
  return `
  <div class="tab-bar" id="tabBar">
    <span class="tab-new" id="newTabBtn" title="New tab">+</span>
  </div>`;
}

// ─── Panels HTML ─────────────────────────────────────────────────────────────
function renderPanels() {
  return `
    <!-- Browser panel -->
    <div class="panel" id="panel-browser">
      <div class="home-page" id="homePage">
        <div class="home-headline">Browse Freely.<br/>Stay Private.</div>
        <div class="home-sub">
          Nexus routes your traffic through a secure proxy layer
          using Ultraviolet &amp; Scramjet — no traces, no limits.
        </div>
        <div class="home-search">
          <input
            id="homeSearchInput"
            type="text"
            placeholder="Search or enter a URL..."
            autocomplete="off"
            spellcheck="false"
          />
          <button class="btn btn-primary" id="homeGoBtn">Go →</button>
        </div>
        <div class="quick-links">
          <div class="quick-link" data-url="https://wikipedia.org">📖 Wikipedia</div>
          <div class="quick-link" data-url="https://github.com">🐙 GitHub</div>
          <div class="quick-link" data-url="https://news.ycombinator.com">🔶 HN</div>
          <div class="quick-link" data-url="https://reddit.com">👾 Reddit</div>
          <div class="quick-link" data-url="https://youtube.com">▶ YouTube</div>
        </div>
      </div>
      <div class="browser-frame-wrap" id="browserFrameWrap" style="display:none">
        <div class="browser-loading" id="browserLoading">
          <div class="browser-loading-spinner"></div>
          <div style="font-size:13px;color:var(--text-2)">Loading...</div>
        </div>
        <!-- Tabs render their iframes here -->
      </div>
    </div>

    <!-- Dashboard panel -->
    <div class="panel" id="panel-dashboard">
      <div class="dash-grid" id="statsGrid">
        <div class="stat-card">
          <div class="stat-label">Total Requests</div>
          <div class="stat-value" id="stat-total">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Latency</div>
          <div class="stat-value" id="stat-latency">0<span class="stat-unit">ms</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Errors</div>
          <div class="stat-value" id="stat-errors">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Req / min</div>
          <div class="stat-value" id="stat-rpm">0</div>
        </div>
      </div>

      <div class="log-panel">
        <div class="log-panel-header">
          <div class="log-panel-title">Live Request Log</div>
          <button class="log-clear-btn" id="clearLogsBtn">Clear</button>
        </div>
        <div class="log-list" id="logList">
          <div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px">
            Waiting for requests…
          </div>
        </div>
      </div>
    </div>

    <!-- History panel -->
    <div class="panel" id="panel-history">
      <h2 style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-bottom:4px">
        Browsing History
      </h2>
      <p style="font-size:12px;color:var(--text-3);margin-bottom:16px">
        History is stored locally and never sent to any server.
      </p>
      <div id="historyList"></div>
    </div>

    <!-- Config panel -->
    <div class="panel" id="panel-config">
      <h2 style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-bottom:4px">
        Proxy Settings
      </h2>
      <p style="font-size:12px;color:var(--text-3);margin-bottom:20px">
        Changes apply immediately. Some settings require a page reload.
      </p>
      <div class="config-grid" id="configGrid">
        <div class="config-card">
          <h3>Performance</h3>
          <div class="config-row">
            <label>Enable caching</label>
            <label class="toggle">
              <input type="checkbox" id="cfg-cache" checked />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="config-row">
            <label>Request timeout (ms)</label>
            <input type="number" class="config-input" id="cfg-timeout" value="30000" style="width:90px" />
          </div>
          <div class="config-row">
            <label>Rate limit (req/min)</label>
            <input type="number" class="config-input" id="cfg-ratelimit" value="200" style="width:90px" />
          </div>
        </div>

        <div class="config-card">
          <h3>Domain Filtering</h3>
          <div class="config-row" style="flex-direction:column;align-items:flex-start;gap:6px">
            <label>Blocklist (comma-separated hosts)</label>
            <input type="text" class="config-input" id="cfg-blocklist" placeholder="malware.com, ads.example.com" />
          </div>
          <div class="config-row" style="flex-direction:column;align-items:flex-start;gap:6px;margin-top:12px">
            <label>Allowlist (empty = allow all)</label>
            <input type="text" class="config-input" id="cfg-allowlist" placeholder="wikipedia.org, github.com" />
          </div>
        </div>

        <div class="config-card">
          <h3>Search Engine</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              ["Google",     "https://www.google.com/search?q="],
              ["DuckDuckGo", "https://duckduckgo.com/?q="],
              ["Brave",      "https://search.brave.com/search?q="],
              ["Bing",       "https://www.bing.com/search?q="],
            ].map(([name, url]) => `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-2)">
                <input type="radio" name="searchEngine" value="${url}" ${name === "Google" ? "checked" : ""}
                  style="accent-color:var(--accent-1)" />
                ${name}
              </label>
            `).join("")}
          </div>
        </div>

        <div class="config-card">
          <h3>Custom Headers</h3>
          <div class="config-row" style="flex-direction:column;align-items:flex-start;gap:6px">
            <label>Extra request headers (JSON)</label>
            <textarea class="config-input" id="cfg-headers" rows="4"
              placeholder='{"X-Custom": "value"}'
              style="resize:vertical;height:80px;line-height:1.4"></textarea>
          </div>
          <button class="btn btn-primary" id="saveConfigBtn" style="margin-top:12px;width:100%;justify-content:center">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  `;
}

function showError(msg) {
  console.error("[Nexus]", msg);
}

// ── Start ──────────────────────────────────────────────────────────────────────
boot().catch(console.error);
