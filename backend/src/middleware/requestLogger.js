/**
 * Request Logger Middleware
 * Intercepts each request to record timing and response size into MetricsService.
 */

export function requestLogger(metrics) {
  return (req, res, next) => {
    const start = Date.now();

    // Patch res.end to capture bytes sent
    const origEnd = res.end.bind(res);
    let bytes = 0;
    res.end = function (chunk, ...args) {
      if (chunk) bytes += Buffer.byteLength(chunk);
      return origEnd(chunk, ...args);
    };

    res.on("finish", () => {
      // Skip bare-server internal paths and health checks
      if (req.path === "/health" || req.path.includes("__internal")) return;

      metrics.record({
        method:    req.method,
        url:       req.originalUrl || req.url,
        status:    res.statusCode,
        latencyMs: Date.now() - start,
        bytes,
        error:     res.statusCode >= 500 ? `HTTP ${res.statusCode}` : null,
      });
    });

    next();
  };
}
