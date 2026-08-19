import path from "node:path";
import { fileURLToPath } from "node:url";

import { scaffoldVideo } from "./new";
import { sync } from "./sync";

/** src/cli → apps/remotion package root. */
const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const videosDir = path.join(pkgRoot, "videos");
const manifestFile = path.join(pkgRoot, "src", "videos.gen.ts");

const USAGE = "usage: tsx src/cli/main.ts [sync | new <slug>]";

const command = process.argv[2] ?? "sync";
switch (command) {
  case "sync": {
    const r = sync(videosDir, manifestFile);
    console.log(
      `[remotion] manifest: ${r.count} video(s) [${r.slugs.join(", ")}]${r.changed ? " (regenerated)" : ""}`,
    );
    break;
  }
  case "new": {
    const slug = process.argv[3];
    if (!slug) {
      console.error(USAGE);
      process.exit(1);
    }
    const dest = scaffoldVideo(slug, { videosDir, manifestFile });
    console.log(
      `[remotion] scaffolded ${path.relative(pkgRoot, dest)} — edit it, then: pnpm --filter @useaccord/remotion studio`,
    );
    break;
  }
  default:
    console.error(`unknown command '${command}'\n${USAGE}`);
    process.exit(1);
}
