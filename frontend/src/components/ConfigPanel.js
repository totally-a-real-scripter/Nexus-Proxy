/**
 * ConfigPanel Component
 * Loads current config from /api/config and saves changes via PATCH.
 */

import { $, on } from "../utils/dom.js";

export class ConfigPanel {
  constructor() {
    this._saveBtn = document.getElementById("saveConfigBtn");
    on(this._saveBtn, "click", () => this._save());
    this._load();
  }

  async _load() {
    try {
      const res  = await fetch("/api/config");
      const cfg  = await res.json();

      const cache     = document.getElementById("cfg-cache");
      const timeout   = document.getElementById("cfg-timeout");
      const rateLimit = document.getElementById("cfg-ratelimit");
      const blocklist = document.getElementById("cfg-blocklist");
      const allowlist = document.getElementById("cfg-allowlist");
      const headers   = document.getElementById("cfg-headers");

      if (cache)     cache.checked       = cfg.cacheEnabled ?? true;
      if (timeout)   timeout.value       = cfg.timeoutMs    ?? 30000;
      if (rateLimit) rateLimit.value     = cfg.rateLimitMax ?? 200;
      if (blocklist) blocklist.value     = (cfg.domainBlocklist || []).join(", ");
      if (allowlist) allowlist.value     = (cfg.domainAllowlist || []).join(", ");
      if (headers)   headers.value       = JSON.stringify(cfg.customHeaders || {}, null, 2);

      // Search engine radio
      const engineVal = cfg.searchEngine || "";
      document.querySelectorAll('input[name="searchEngine"]').forEach(radio => {
        radio.checked = radio.value === engineVal;
      });
    } catch (err) {
      console.error("[ConfigPanel] Load failed:", err);
    }
  }

  async _save() {
    const btn = this._saveBtn;
    btn.textContent = "Saving…";
    btn.disabled    = true;

    try {
      const cache     = document.getElementById("cfg-cache");
      const timeout   = document.getElementById("cfg-timeout");
      const rateLimit = document.getElementById("cfg-ratelimit");
      const blocklist = document.getElementById("cfg-blocklist");
      const allowlist = document.getElementById("cfg-allowlist");
      const headers   = document.getElementById("cfg-headers");
      const engine    = document.querySelector('input[name="searchEngine"]:checked');

      let customHeaders = {};
      try { customHeaders = JSON.parse(headers?.value || "{}"); } catch { /* ignore bad JSON */ }

      const body = {
        cacheEnabled:    cache?.checked ?? true,
        timeoutMs:       parseInt(timeout?.value  || "30000",  10),
        rateLimitMax:    parseInt(rateLimit?.value || "200",   10),
        domainBlocklist: (blocklist?.value || "").split(",").map(s => s.trim()).filter(Boolean),
        domainAllowlist: (allowlist?.value || "").split(",").map(s => s.trim()).filter(Boolean),
        searchEngine:    engine?.value || "https://www.google.com/search?q=",
        customHeaders,
      };

      const res = await fetch("/api/config", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Save failed");
      btn.textContent = "✓ Saved!";
      setTimeout(() => { btn.textContent = "Save Settings"; btn.disabled = false; }, 2000);
    } catch (err) {
      btn.textContent = "Save failed";
      btn.disabled    = false;
      console.error("[ConfigPanel] Save error:", err);
    }
  }
}
