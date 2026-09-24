// Remotion's webpack bundler runs PostCSS on imported CSS. Tailwind v4's
// PostCSS plugin is the engine for src/shell/theme.css (same role
// @tailwindcss/vite plays in apps/*). It also resolves the @import chain:
// tailwindcss → tw-animate-css → @useaccord/ui/styles.css (tokens, theme,
// Fontsource fonts, base).
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
