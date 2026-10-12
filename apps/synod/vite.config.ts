import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @useaccord/synod-app — static React SPA for the Synod dApp.
// HashRouter (no server routing), so base can stay relative for GitHub Pages.
// `base: "./"` keeps the built index.html portable across user/project pages.
// No CI deploy workflow (owner decision) — deploy is manual from dist/.
export default defineConfig(({ mode }) => ({
  base: "./",
  // See apps/app/vite.config.ts — Codama error-map guards need NODE_ENV defined in dev.
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      mode === "production" ? "production" : "development",
    ),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
}));
