import { defineConfig } from "tsup";

/**
 * Bundle the Canon SDK into ESM.
 *
 * Same rationale as `packages/sdk/tsup.config.ts`: `tsc` emits relative
 * imports verbatim, and the generated Codama output carries extensionless
 * barrel specifiers (`from "../accounts"`, `from "../pdas"`) that Node's ESM
 * loader cannot resolve (it requires explicit extensions). Shipping raw `tsc`
 * output therefore breaks `@useaccord/canon` under Node — e.g. the PDA smoke
 * test (`node --test`) once `pda.ts` sources `CANON_PROGRAM_ADDRESS` from the
 * generated program module. Bundling resolves every specifier at build time,
 * so `dist/` is valid Node ESM regardless of source style.
 *
 * Layout: single entry chunk (`index`) matching the package `exports` map.
 * Runtime deps stay external (resolved from consumers' node_modules); source +
 * generated Codama output get inlined. Type declarations are still emitted by
 * `tsc --emitDeclarationOnly` (see package.json `build`).
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  splitting: true,
  sourcemap: true,
  clean: true,
  keepNames: true,
  external: ["@solana/kit", "@useaccord/sdk"],
});
