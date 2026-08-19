import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { sync } from "./sync";

const SLUG_RE = /^[a-z][a-z0-9-]*$/;
const TEXT_EXT: Record<string, true> = {
  ".css": true,
  ".md": true,
  ".ts": true,
  ".tsx": true,
};

/** Copy videos/_template → videos/<slug>, substituting __SLUG__. */
function copyTemplate(templateDir: string, dest: string, slug: string): void {
  mkdirSync(dest, { recursive: true });
  const walk = (from: string, to: string) => {
    for (const ent of readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, ent.name);
      const out = path.join(to, ent.name);
      if (ent.isDirectory()) {
        walk(src, out);
        continue;
      }
      cpSync(src, out);
      if (TEXT_EXT[path.extname(ent.name)]) {
        writeFileSync(out, readFileSync(out, "utf8").replaceAll("__SLUG__", slug));
      }
    }
  };
  walk(templateDir, dest);
}

export function scaffoldVideo(
  slug: string,
  opts: { videosDir: string; manifestFile: string },
): string {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`video slug must be kebab-case (e.g. my-video), got '${slug}'`);
  }
  const dest = path.join(opts.videosDir, slug);
  if (existsSync(dest)) {
    throw new Error(`videos/${slug} already exists`);
  }
  copyTemplate(path.join(opts.videosDir, "_template"), dest, slug);
  sync(opts.videosDir, opts.manifestFile);
  return dest;
}
