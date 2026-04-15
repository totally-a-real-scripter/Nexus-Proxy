/**
 * HistoryManager Component
 * Stores and renders browsing history in localStorage.
 * History never leaves the device.
 */

import { on } from "../utils/dom.js";

const STORAGE_KEY = "nexus_history";
const MAX_ENTRIES = 500;

export class HistoryManager {
  constructor() {
    this._entries = this._load();
    this._render();
  }

  // ── Push a new entry ───────────────────────────────────────────────────────
  push({ url, title, ts }) {
    // Deduplicate consecutive same-URL entries
    if (this._entries.length && this._entries[0].url === url) return;

    this._entries.unshift({ url, title: title || url, ts: ts || Date.now() });
    if (this._entries.length > MAX_ENTRIES) this._entries.pop();
    this._persist();
    this._render();
  }

  // ── Render history list ────────────────────────────────────────────────────
  _render() {
    const list = document.getElementById("historyList");
    if (!list) return;

    if (this._entries.length === 0) {
      list.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-3);font-size:13px">
          Your browsing history will appear here.
        </div>`;
      return;
    }

    list.innerHTML = this._entries.map(entry => `
      <div class="history-item" data-url="${this._escape(entry.url)}">
        <img class="history-favicon"
          src="https://www.google.com/s2/favicons?domain=${this._hostname(entry.url)}&sz=16"
          onerror="this.src=''" alt="" />
        <span class="history-title">${this._escape(entry.title)}</span>
        <span class="history-url">${this._escape(entry.url)}</span>
        <span class="history-time">${this._formatTime(entry.ts)}</span>
      </div>
    `).join("");

    // Click to navigate
    list.querySelectorAll(".history-item").forEach(el => {
      on(el, "click", () => {
        // Dispatch a custom event that app.js can listen to
        window.dispatchEvent(new CustomEvent("nexus:navigate", {
          detail: { url: el.dataset.url },
        }));
      });
    });
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch { return []; }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries));
    } catch { /* storage full */ }
  }

  _hostname(url) {
    try { return new URL(url).hostname; } catch { return ""; }
  }

  _formatTime(ts) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000)  return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString();
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
