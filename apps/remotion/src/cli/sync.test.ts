import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { renderManifest, scanVideos, sync } from "./sync";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), "remotion-sync-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("scanVideos", () => {
  it("discovers dirs with index.ts or index.tsx, sorted, with src-relative import paths", () => {
    const root = tmp();
    mkdirSync(path.join(root, "beta"));
    writeFileSync(path.join(root, "beta", "index.ts"), "export {}");
    mkdirSync(path.join(root, "alpha"));
    writeFileSync(path.join(root, "alpha", "index.tsx"), "export {}");
    mkdirSync(path.join(root, "assets-only"));

    expect(scanVideos(root)).toEqual([
      { slug: "alpha", importPath: "../videos/alpha/index" },
      { slug: "beta", importPath: "../videos/beta/index" },
    ]);
  });

  it("skips the _template scaffold dir", () => {
    const root = tmp();
    mkdirSync(path.join(root, "_template"));
    writeFileSync(path.join(root, "_template", "index.tsx"), "export {}");

    expect(scanVideos(root)).toEqual([]);
  });

  it("rejects invalid slug names with a helpful error", () => {
    const root = tmp();
    mkdirSync(path.join(root, "Bad_Name"));
    writeFileSync(path.join(root, "Bad_Name", "index.ts"), "export {}");

    expect(() => scanVideos(root)).toThrow(/Bad_Name/);
  });
});

describe("renderManifest", () => {
  it("emits static imports plus the videos array", () => {
    const out = renderManifest([
      { slug: "how-it-works", importPath: "../videos/how-it-works/index" },
      { slug: "example", importPath: "../videos/example/index" },
    ]);

    expect(out).toContain(
      'import { video as video_how_it_works } from "../videos/how-it-works/index";',
    );
    expect(out).toContain(
      'import { video as video_example } from "../videos/example/index";',
    );
    expect(out).toContain("export const videos: VideoDefinition[] = [");
    expect(out).toContain("video_how_it_works,");
    expect(out).toContain("video_example,");
  });
});

describe("sync", () => {
  it("writes the generated manifest file and reports the slugs", () => {
    const videosRoot = tmp();
    mkdirSync(path.join(videosRoot, "demo"));
    writeFileSync(path.join(videosRoot, "demo", "index.tsx"), "export {}");
    const outDir = tmp();
    const outFile = path.join(outDir, "videos.gen.ts");

    const result = sync(videosRoot, outFile);

    expect(result.slugs).toEqual(["demo"]);
    const content = readFileSync(outFile, "utf8");
    expect(content).toContain('from "../videos/demo/index"');
  });

  it("is idempotent for unchanged content", () => {
    const videosRoot = tmp();
    mkdirSync(path.join(videosRoot, "demo"));
    writeFileSync(path.join(videosRoot, "demo", "index.tsx"), "export {}");
    const outFile = path.join(tmp(), "videos.gen.ts");

    sync(videosRoot, outFile);
    const second = sync(videosRoot, outFile);

    expect(second.changed).toBe(false);
  });
});
