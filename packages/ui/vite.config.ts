import tailwindcss from "@tailwindcss/vite";

// Consumed by Storybook's builder-vite for the preview iframe build:
// compiles the Tailwind v4 engine against .storybook/preview.css.
// Vitest uses vitest.config.ts instead, so tests are unaffected.
// Plain object (no `defineConfig`) — `vite` itself is not a dependency here.
export default {
  plugins: [tailwindcss()],
};
