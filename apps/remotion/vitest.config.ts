import { defineConfig } from "vitest/config";

// Unit contract tests for the framework: manifest generation + AppHarness
// seeding (renders real apps/app feature views in jsdom).
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
