import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @useaccord/app — static React SPA for the Accord dApp.
// HashRouter (no server routing), so base can stay relative for GitHub Pages.
// `base: "./"` keeps the built index.html portable across user/project pages.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
