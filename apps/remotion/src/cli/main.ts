import path from "node:path";
import { fileURLToPath } from "node:url";

import { scaffoldVideo } from "./new";
import { renderAllScores, renderScore } from "./score";
import { sync } from "./sync";

/** src/cli → apps/remotion package root. */
const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const videosDir = path.join(pkgRoot, "videos");
const manifestFile = path.join(pkgRoot, "src", "videos.gen.ts");
const twClassesFile = path.join(pkgRoot, "src", "video-tw-classes.ts");

const USAGE = "usage: tsx src/cli/main.ts [sync | new <slug> | score <name> [seconds]]";

const command = process.argv[2] ?? "sync";
switch (command) {
  case "sync": {
    const r = sync(videosDir, manifestFile, twClassesFile);
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
    const dest = scaffoldVideo(slug, { videosDir, manifestFile, twClassesFile });
    console.log(
      `[remotion] scaffolded ${path.relative(pkgRoot, dest)} — edit it, then: pnpm --filter @useaccord/remotion studio`,
    );
    break;
  }
  case "score": {
    const staleOnly = process.argv.includes("--stale");
    const args = process.argv.slice(3).filter((arg) => arg !== "--stale");
    const name = args[0];
    const seconds = Number(args[1] ?? 30);
    if (Number.isNaN(seconds) || seconds <= 0) {
      console.error(`invalid seconds '${args[1]}'\n${USAGE}`);
      process.exit(1);
    }
    const results = name
      ? [await renderScore(name, { seconds, staleOnly })]
      : await renderAllScores({ seconds, staleOnly });
    for (const r of results) {
      if (!r) continue; // fresh artifact, staleOnly skip
      console.log(
        `[remotion] score ${r.name} → ${path.relative(pkgRoot, r.wavPath)} (${r.seconds}s, peak ${r.peak.toFixed(3)})`,
      );
    }
    const rendered = results.filter((r) => r).length;
    if (!rendered) console.log("[remotion] scores up to date");
    break;
  }
  default:
    console.error(`unknown command '${command}'\n${USAGE}`);
    process.exit(1);
}
