import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // In dev, Vite proxies these paths to the Node backend on 37291
      "/bare":    "http://localhost:37291",
      "/service": "http://localhost:37291",
      "/scram":   "http://localhost:37291",
      "/api":     "http://localhost:37291",
      "/wisp": {
        target: "ws://localhost:37291",
        ws: true,           // forward WebSocket upgrades for /wisp/
        changeOrigin: true,
      },
    },
  },
  define: {
    // Injected at build time — override with VITE_* env vars if needed
    "__BARE_PREFIX__":      JSON.stringify(process.env.VITE_BARE_PREFIX      || "/bare/"),
    "__UV_PREFIX__":        JSON.stringify(process.env.VITE_UV_PREFIX        || "/service/"),
    "__SCRAMJET_PREFIX__":  JSON.stringify(process.env.VITE_SCRAMJET_PREFIX  || "/scram/"),
    // Leave empty — browser fetches the real URL from /api/transport-config at runtime
    "__WISP_URL__":         JSON.stringify(process.env.VITE_WISP_URL         || ""),
  },
});
