import { defineConfig } from "tsup";

/**
 * ESM bundle matching the repo package pattern (@useaccord/sdk). React and
 * React DOM are peer dependencies and stay external (one React instance per
 * consumer). Runtime deps (radix-ui, cva, motion, sonner, …) are regular
 * dependencies and therefore also externalized by tsup — consumers resolve
 * them from their own node_modules, consistent with the SDK package.
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  splitting: true,
  sourcemap: true,
  clean: true,
  keepNames: true,
  external: ["react", "react-dom"],
});
