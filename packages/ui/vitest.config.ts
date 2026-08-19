import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Two vitest projects:
// - default (unnamed): jsdom + Testing Library unit tests, colocated *.test.tsx
// - "storybook": runs every *.stories.tsx in headless chromium (playwright),
//   so stories with play() functions and the a11y checks run in CI.
// See https://storybook.js.org/docs/writing-tests/integrations/vitest-addon
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        plugins: [
          // Tailwind v4 engine — vite.config.ts (dev/build pipeline) is NOT
          // extended by vitest; without this the storybook project renders
          // unstyled DOM and axe reports phantom contrast violations.
          tailwindcss(),
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: "playwright",
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
