import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/bare": "http://localhost:8080",
      "/service": "http://localhost:8080",
      "/scram": "http://localhost:8080",
      "/api": "http://localhost:8080",
    },
  },
  define: {
    // Inject env vars into the frontend bundle
    __BARE_PREFIX__: JSON.stringify(process.env.VITE_BARE_PREFIX || "/bare/"),
    __UV_PREFIX__: JSON.stringify(process.env.VITE_UV_PREFIX || "/service/"),
    __SCRAMJET_PREFIX__: JSON.stringify(process.env.VITE_SCRAMJET_PREFIX || "/scram/"),
    __WISP_URL__: JSON.stringify(process.env.VITE_WISP_URL || ""),
  },
});
