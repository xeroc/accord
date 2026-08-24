import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @useaccord/hanse — static React SPA for hanse.useaccord.xyz.
// Custom domain at the subdomain root (public/CNAME), so base stays "/".
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
