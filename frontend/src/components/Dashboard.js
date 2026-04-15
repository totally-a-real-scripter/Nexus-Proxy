/**
 * Dashboard Component
 * Subscribes to /api/stream (SSE) for real-time request logs and stats.
 * Updates stat cards and the log list without polling.
 */

import { $, on } from "../utils/dom.js";

export class Dashboard {
  constructor() {
    this._logList    = document.getElementById("logList");
    this._clearBtn   = document.getElementById("clearLogsBtn");
    this._statEls    = {
      total:   document.getElementById("stat-total"),
      latency: document.getElementById("stat-latency"),
      errors:  document.getElementById("stat-errors"),
      rpm:     document.getElementById("stat-rpm"),
    };

    this._logs = [];

    on(this._clearBtn, "click", () => this._clearLogs());

    this._connectStream();
  }

  // ── SSE connection ────────────────────────────────────────────────────────
  _connectStream() {
    const es = new EventSource("/api/stream");

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "init") {
        // Initial dump: populate stats + logs
        this._updateStats(msg.data.stats);
        msg.data.logs.forEach(entry => this._addLogEntry(entry, false));
        this._renderLogs();
      } else if (msg.type === "stats") {
        this._updateStats(msg.data);
      } else if (msg.type === "log") {
        this._addLogEntry(msg.data, true);
      }
    };

    es.onerror = () => {
      // Reconnect after 3s on failure
      es.close();
      setTimeout(() => this._connectStream(), 3000);
    };
  }

  // ── Stats update ──────────────────────────────────────────────────────────
  _updateStats(stats) {
    if (!stats) return;
    this._animateNumber(this._statEls.total,   stats.totalRequests ?? 0);
    this._animateNumber(this._statEls.latency, stats.avgLatencyMs  ?? 0, "ms");
    this._animateNumber(this._statEls.errors,  stats.totalErrors   ?? 0);
    this._animateNumber(this._statEls.rpm,     stats.requestsPerMin ?? 0);
  }

  _animateNumber(el, target, unit = "") {
    if (!el) return;
    const current = parseFloat(el.dataset.value || "0");
    if (current === target) return;

    el.dataset.value = target;
    const steps = 12;
    const step  = (target - current) / steps;
    let   val   = current;
    let   i     = 0;

    const tick = () => {
      val += step;
      i++;
      const display = i >= steps ? target : Math.round(val);
      el.innerHTML = `${display}<span class="stat-unit">${unit}</span>`;
      if (i < steps) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Log entries ───────────────────────────────────────────────────────────
  _addLogEntry(entry, prepend = true) {
    if (prepend) {
      this._logs.unshift(entry);
      if (this._logs.length > 200) this._logs.pop();
      this._prependLogRow(entry);
    } else {
      this._logs.push(entry);
    }
  }

  _renderLogs() {
    if (!this._logList) return;
    if (this._logs.length === 0) {
      this._logList.innerHTML =
        `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px">No requests yet.</div>`;
      return;
    }
    this._logList.innerHTML = this._logs.map(e => this._rowHTML(e)).join("");
  }

  _prependLogRow(entry) {
    if (!this._logList) return;

    // Remove empty state placeholder
    const placeholder = this._logList.querySelector("div");
    if (placeholder && !placeholder.classList.contains("log-entry")) {
      placeholder.remove();
    }

    const row = document.createElement("div");
    row.className = "log-entry";
    row.innerHTML = this._rowInnerHTML(entry);
    this._logList.insertBefore(row, this._logList.firstChild);

    // Cap DOM entries at 100
    while (this._logList.children.length > 100) {
      this._logList.lastChild?.remove();
    }
  }

  _rowHTML(entry) {
    return `<div class="log-entry">${this._rowInnerHTML(entry)}</div>`;
  }

  _rowInnerHTML(entry) {
    const time    = new Date(entry.ts).toLocaleTimeString();
    const method  = entry.method || "GET";
    const url     = this._truncateUrl(entry.url || "");
    const status  = entry.status ?? 0;
    const latency = entry.latencyMs ?? 0;

    const statusClass = status >= 500 ? "s5xx"
                      : status >= 400 ? "s4xx"
                      : status >= 300 ? "s3xx"
                      : "s2xx";
    const methodClass = ["GET","POST","PUT","DELETE"].includes(method) ? method : "GET";

    return `
      <span class="log-time">${time}</span>
      <span class="log-method ${methodClass}">${method}</span>
      <span class="log-url" title="${entry.url || ""}">${url}</span>
      <span class="log-status ${statusClass}">${status || "—"}</span>
      <span class="log-latency">${latency}ms</span>
    `;
  }

  _truncateUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      return url.length > 50 ? url.slice(0, 50) + "…" : url;
    }
  }

  _clearLogs() {
    this._logs = [];
    if (this._logList) {
      this._logList.innerHTML =
        `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px">Logs cleared.</div>`;
    }
  }
}
