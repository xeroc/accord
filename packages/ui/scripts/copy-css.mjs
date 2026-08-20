// Copies src/styles/*.css into dist/ so the package exports
// ./dist/styles.css and ./dist/tokens.css. Portable (node:fs, no shell).
import { copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const srcDir = join(import.meta.dirname, "..", "src", "styles");
const outDir = join(import.meta.dirname, "..", "dist");

for (const file of readdirSync(srcDir)) {
  if (file.endsWith(".css")) {
    copyFileSync(join(srcDir, file), join(outDir, file));
    console.log(`copied ${file}`);
  }
}
