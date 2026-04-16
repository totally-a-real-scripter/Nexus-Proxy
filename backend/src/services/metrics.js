/**
 * Metrics Service
 * Tracks request counts, latency, errors, and bandwidth in memory.
 * Exposes SSE (Server-Sent Events) stream for real-time dashboard updates.
 */

const MAX_LOG_ENTRIES = 200;

export class MetricsService {
  constructor() {
    this.logs        = [];      // Recent request log entries
    this.clients     = new Set(); // SSE subscribers
    this.stats = {
      totalRequests:  0,
      totalErrors:    0,
      totalBytes:     0,
      avgLatencyMs:   0,
      latencySum:     0,
      startTime:      Date.now(),
      requestsPerMin: 0,
    };
    this._minuteWindow = [];

    // Rolling requests-per-minute counter
    setInterval(() => {
      const now = Date.now();
      this._minuteWindow = this._minuteWindow.filter(t => now - t < 60_000);
      this.stats.requestsPerMin = this._minuteWindow.length;
      this._broadcast({ type: "stats", data: this.getStats() });
    }, 5_000);
  }

  // ── Record a completed request ─────────────────────────────────────────────
  record({ method, url, status, latencyMs, bytes = 0, error = null }) {
    const entry = {
      id:        crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      ts:        Date.now(),
      method,
      url,
      status,
      latencyMs,
      bytes,
      error,
    };

    // Update aggregate stats
    this.stats.totalRequests++;
    this.stats.totalBytes += bytes;
    this.stats.latencySum += latencyMs;
    this.stats.avgLatencyMs = Math.round(
      this.stats.latencySum / this.stats.totalRequests
    );
    if (status >= 400 || error) this.stats.totalErrors++;
    this._minuteWindow.push(Date.now());

    // Prepend to log ring-buffer
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) this.logs.pop();

    // Push to all SSE clients
    this._broadcast({ type: "log", data: entry });
  }

  // ── Return current stats snapshot ─────────────────────────────────────────
  getStats() {
    return {
      ...this.stats,
      uptimeSeconds: Math.floor((Date.now() - this.stats.startTime) / 1000),
      logCount:      this.logs.length,
    };
  }

  // ── SSE helpers ───────────────────────────────────────────────────────────
  addClient(res) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  _broadcast(payload) {
    const chunk = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try { client.write(chunk); } catch { this.clients.delete(client); }
    }
  }
}

// Singleton instance shared across routes
export const metricsService = new MetricsService();
