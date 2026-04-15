/**
 * API Routes
 * GET  /api/metrics      → snapshot of aggregate stats
 * GET  /api/logs         → recent request log entries
 * GET  /api/stream       → SSE real-time stream
 * POST /api/resolve      → resolve a URL (validate + canonicalise)
 */

import { Router } from "express";

export default function apiRouter(metrics) {
  const router = Router();

  // ── Stats snapshot ────────────────────────────────────────────────────────
  router.get("/metrics", (_req, res) => {
    res.json(metrics.getStats());
  });

  // ── Recent logs ───────────────────────────────────────────────────────────
  router.get("/logs", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    res.json(metrics.logs.slice(0, limit));
  });

  // ── SSE real-time stream ──────────────────────────────────────────────────
  // Frontend subscribes here for live log + stats updates without polling
  router.get("/stream", (req, res) => {
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Send current state immediately on connect
    res.write(`data: ${JSON.stringify({ type: "init", data: {
      stats: metrics.getStats(),
      logs:  metrics.logs.slice(0, 50),
    }})}\n\n`);

    // Keep-alive ping every 25s
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);

    metrics.addClient(res);

    req.on("close", () => {
      clearInterval(ping);
    });
  });

  // ── URL resolve/validate ──────────────────────────────────────────────────
  router.post("/resolve", (req, res) => {
    let { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing url" });
    }

    // Auto-prefix protocol if missing
    if (!/^https?:\/\//i.test(url)) {
      // Check if it looks like a hostname (has a dot and no spaces)
      if (/^[^\s]+\.[^\s]+/.test(url)) {
        url = "https://" + url;
      } else {
        // Treat as a search query
        const engine = process.env.SEARCH_ENGINE ||
          "https://www.google.com/search?q=";
        url = engine + encodeURIComponent(url);
      }
    }

    try {
      const parsed = new URL(url);
      res.json({ resolved: parsed.href, host: parsed.hostname });
    } catch {
      res.status(400).json({ error: "Invalid URL" });
    }
  });

  return router;
}
