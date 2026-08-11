import { readdirSync, statSync } from "node:fs";
import { relative } from "node:path";
import { defineConfig } from "tsup";

/**
 * Collect every oclif command module under src/commands and map it to a
 * dist/commands/<topic>/<name> output key, preserving the topic directory
 * structure oclif relies on for discovery (`commands: "./dist/commands"`).
 */
function commandEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = `${dir}/${name}`;
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
        const key = relative("src", abs).replace(/\.ts$/, "");
        entries[key] = abs;
      }
    }
  };
  walk("src/commands");
  return entries;
}

/**
 * Bundle each oclif command into a self-contained ESM module under
 * dist/commands/.
 *
 * Why: `@useaccord/sdk` is declared `workspace:*`, so a global `npm i -g .`
 * resolves it back into this monorepo checkout (fragile, non-portable).
 * Inlining the SDK into each command chunk makes the CLI self-contained; a
 * global install then only needs the registry runtime deps (@oclif/core,
 * @solana/kit) which npm fetches normally. Shared lib/* helpers are code-split
 * into chunks rather than copied into all 51 commands.
 *
 * `keepNames` preserves Command class names that oclif metadata can reflect on.
 */
export default defineConfig({
  entry: commandEntries(),
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  splitting: true,
  sourcemap: true,
  clean: true,
  keepNames: true,
  external: ["@oclif/core", "@oclif/plugin-help", "@solana/kit"],
});
