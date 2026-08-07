// @useaccord/landing — static Astro site for useaccord.xyz
// Tailwind v4 via the Vite plugin (CSS-first config in src/styles/global.css).
// Deployed to GitHub Pages with a custom domain (CNAME in public/), so base stays '/'.
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Public env: PUBLIC_WAITLIST_ENDPOINT — the n8n webhook the waitlist form POSTs to.
// Set it in apps/landing/.env (or repo Actions secrets) to wire the form.

export default defineConfig({
  site: "https://useaccord.xyz",
  vite: {
    plugins: [tailwindcss()],
  },
});
