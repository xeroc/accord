import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @useaccord/app — static React SPA for the Accord dApp.
// HashRouter (no server routing), so base can stay relative for GitHub Pages.
// `base: "./"` keeps the built index.html portable across user/project pages.
export default defineConfig(({ mode }) => ({
  base: "./",
  // Codama-generated error maps (@useaccord/sdk dist) guard their message
  // tables behind `process.env["NODE_ENV"] !== "production"`. The browser has
  // no `process` global — production builds already replace it (and drop the
  // tables via DCE); this does the same for `vite dev`, which otherwise throws
  // `process is not defined` at module scope (white screen).
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
