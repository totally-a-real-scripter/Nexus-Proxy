import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "fs";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        // Service workers must be bundled separately at root scope
        "uv/uv.sw":      "public/uv/uv.sw.js",
        "scram/scram.sw": "public/scramjet/scram.sw.js",
      },
    },
  },
  server: {
    proxy: {
      "/bare":    "http://localhost:8080",
      "/service": "http://localhost:8080",
      "/scram":   "http://localhost:8080",
      "/api":     "http://localhost:8080",
    },
  },
  define: {
    // Inject env vars into the frontend bundle
    "__BARE_PREFIX__":      JSON.stringify(process.env.VITE_BARE_PREFIX || "/bare/"),
    "__UV_PREFIX__":        JSON.stringify(process.env.VITE_UV_PREFIX || "/service/"),
    "__SCRAMJET_PREFIX__":  JSON.stringify(process.env.VITE_SCRAMJET_PREFIX || "/scram/"),
    "__WISP_URL__":         JSON.stringify(process.env.VITE_WISP_URL || ""),
  },
});
