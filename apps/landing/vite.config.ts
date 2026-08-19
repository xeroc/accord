import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @useaccord/landing — static React SPA for useaccord.xyz.
// Deployed to GitHub Pages with a custom domain (public/CNAME), so base
// stays "/" (unlike apps/app's portable "./").
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
