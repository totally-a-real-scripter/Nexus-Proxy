/**
 * Domain Filter Middleware
 * Enforces DOMAIN_ALLOWLIST and DOMAIN_BLOCKLIST env vars.
 * Lists are comma-separated hostname patterns (supports wildcards via startsWith).
 *
 * Examples:
 *   DOMAIN_BLOCKLIST=malware.com,ads.example.com
 *   DOMAIN_ALLOWLIST=wikipedia.org,github.com   (empty = allow all)
 */

const parseList = (env) =>
  (process.env[env] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const BLOCKLIST  = parseList("DOMAIN_BLOCKLIST");
const ALLOWLIST  = parseList("DOMAIN_ALLOWLIST");

function extractHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesList(host, list) {
  return list.some(
    (entry) => host === entry || host.endsWith("." + entry)
  );
}

export function domainFilter(req, res, next) {
  // Only filter requests that carry a target URL param
  const targetUrl = req.query.url || req.query.target;
  if (!targetUrl) return next();

  const host = extractHost(targetUrl);
  if (!host) return next();

  if (BLOCKLIST.length && matchesList(host, BLOCKLIST)) {
    return res.status(403).json({
      error: "DOMAIN_BLOCKED",
      message: `Access to ${host} is blocked by policy.`,
    });
  }

  if (ALLOWLIST.length && !matchesList(host, ALLOWLIST)) {
    return res.status(403).json({
      error: "DOMAIN_NOT_ALLOWED",
      message: `Access to ${host} is not permitted.`,
    });
  }

  next();
}
