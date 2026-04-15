/**
 * Config Routes
 * Allows the dashboard to read and update runtime proxy settings.
 * Settings are stored in memory (reset on restart).
 * For persistence, swap the store for Redis or a JSON file.
 */

import { Router } from "express";

const router = Router();

// In-memory config store with sensible defaults
const proxyConfig = {
  cacheEnabled:      process.env.CACHE_ENABLED !== "false",
  cacheMaxAgeMs:     parseInt(process.env.CACHE_MAX_AGE_MS || "300000", 10),
  timeoutMs:         parseInt(process.env.PROXY_TIMEOUT_MS || "30000",  10),
  customHeaders:     {},        // { "X-Custom": "value" }
  searchEngine:      process.env.SEARCH_ENGINE || "https://www.google.com/search?q=",
  domainBlocklist:   (process.env.DOMAIN_BLOCKLIST || "").split(",").filter(Boolean),
  domainAllowlist:   (process.env.DOMAIN_ALLOWLIST || "").split(",").filter(Boolean),
  rateLimitMax:      parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
};

// GET current config
router.get("/", (_req, res) => {
  res.json(proxyConfig);
});

// PATCH partial update
router.patch("/", (req, res) => {
  const allowed = [
    "cacheEnabled", "cacheMaxAgeMs", "timeoutMs",
    "customHeaders", "searchEngine",
    "domainBlocklist", "domainAllowlist", "rateLimitMax",
  ];

  for (const key of allowed) {
    if (key in req.body) {
      proxyConfig[key] = req.body[key];
    }
  }

  res.json({ ok: true, config: proxyConfig });
});

// Reset to defaults
router.delete("/", (_req, res) => {
  proxyConfig.cacheEnabled   = true;
  proxyConfig.customHeaders  = {};
  proxyConfig.domainBlocklist = [];
  proxyConfig.domainAllowlist = [];
  res.json({ ok: true, message: "Config reset to defaults" });
});

export default router;
