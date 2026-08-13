import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @useaccord/canon-app — static React SPA for the Canon curated-list registry.
// HashRouter (no server routing), so base stays relative for GitHub Pages.
// `base: "./"` keeps the built index.html portable across user/project pages.
export default defineConfig({
  base: "./",
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
});
