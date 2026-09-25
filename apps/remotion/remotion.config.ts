import { Config } from "@remotion/cli/config";

// @useaccord/remotion — bundler + render configuration.
//
// Remotion's webpack CSS chain is style-loader → css-loader with NO
// PostCSS stage. Tailwind v4 must compile before css-loader (the
// @apply/@theme/@import directives in src/shell/theme.css and
// @useaccord/ui styles are not valid browser CSS), so we prepend
// postcss-loader to the CSS rule. postcss.config.js at the package root
// picks @tailwindcss/postcss, which also resolves the whole @import chain
// (tailwindcss → tw-animate-css → @useaccord/ui/styles.css).
Config.overrideWebpackConfig((config) => {
  const rules = config.module?.rules ?? [];
  const withPostcss = rules.map((rule) => {
    if (!rule || typeof rule === "string") return rule;
    const test = rule.test;
    const uses = rule.use;
    if (
      test instanceof RegExp &&
      test.source.includes("css") &&
      Array.isArray(uses)
    ) {
      return {
        ...rule,
        use: [...uses, { loader: "postcss-loader" }],
      };
    }
    return rule;
  });
  config.module = { ...config.module, rules: withPostcss };
  return config;
});

Config.setEntryPoint("./src/index.ts");
Config.setOverwriteOutput(true);
