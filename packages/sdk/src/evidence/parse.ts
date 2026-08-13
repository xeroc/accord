/**
 * evidence/parse.ts — parse the `accord-evidence/v1` manifest returned by the
 * evidence daemon. Shared by any feature that needs a slice of the manifest
 * (title, description, option labels, entries).
 *
 * The manifest is YAML (produced by `buildManifest`); the daemon may return it
 * as a raw UTF-8 string or as a parsed JSON object. This targeted parser needs
 * no YAML dependency.
 */

export interface ParsedManifest {
  title: string;
  /** Markdown claim body — empty string when absent (pre-description manifests). */
  description: string;
  filedAt: string;
  filer: string;
  subaccord: string;
  dispute: string;
  optionSalt: string;
  options: { index: number; label: string }[];
  entries: { path: string; sha256: string }[];
}

/** Parse the `accord-evidence/v1` YAML format (produced by `buildManifest`). */
export function parseManifest(text: string): ParsedManifest {
  const lines = text.split("\n");
  const getField = (key: string): string | undefined =>
    lines
      .find((l) => l.startsWith(`${key}: `))
      ?.slice(`${key}: `.length)
      .replace(/^"(.*)"$/, "$1");

  // Description is a YAML literal block scalar (`description: |` followed by
  // indented lines). Collect the indented body until a non-indented line.
  let description = "";
  const descIdx = lines.findIndex((l) => l.startsWith("description: |"));
  if (descIdx !== -1) {
    const body: string[] = [];
    for (let i = descIdx + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (l.startsWith("  ")) {
        body.push(l.slice(2));
      } else {
        break;
      }
    }
    description = body.join("\n");
  }

  const options: { index: number; label: string }[] = [];
  const entries: { path: string; sha256: string }[] = [];
  let section: "options" | "entries" | null = null;

  for (const line of lines) {
    if (line === "options:") {
      section = "options";
      continue;
    }
    if (line === "entries:") {
      section = "entries";
      continue;
    }
    if (!line.startsWith("  - {")) continue;

    if (section === "options") {
      const idx = line.match(/index: (\d+)/);
      const lbl = line.match(/label: "([^"]*)"/) ?? line.match(/label: (\S+?)\s*\}/);
      if (idx && lbl) {
        options.push({ index: parseInt(idx[1]!, 10), label: lbl[1]! });
      }
    } else if (section === "entries") {
      const pth = line.match(/path: "([^"]*)"/) ?? line.match(/path: (\S+?)\s*,/);
      const sha = line.match(/sha256: "?([0-9a-f]+)"?/);
      if (pth && sha) {
        entries.push({ path: pth[1]!, sha256: sha[1]! });
      }
    }
  }

  return {
    title: getField("title") ?? "",
    description,
    filedAt: getField("filed_at") ?? "",
    filer: getField("filer") ?? "",
    subaccord: getField("subaccord") ?? "",
    dispute: getField("dispute") ?? "",
    optionSalt: getField("option_salt") ?? "",
    options,
    entries,
  };
}

/**
 * Ordered option labels from a manifest fetched via `useManifest` (a YAML
 * string for the `accord-evidence/v1` format, or a parsed JSON object).
 *
 * Returns labels in index order, contiguously from 0 up to the first missing
 * or blank entry. Callers fall back to the on-chain option hash for any index
 * not covered. Returns `[]` when the manifest is absent (no bundle stored).
 */
export function optionLabels(manifest: unknown): string[] {
  if (!manifest) return [];
  const parsed: ParsedManifest =
    typeof manifest === "string"
      ? parseManifest(manifest)
      : parseManifest(JSON.stringify(manifest));

  const byIndex = new Map<number, string>();
  for (const o of parsed.options) {
    if (o.label.trim()) byIndex.set(o.index, o.label.trim());
  }

  const labels: string[] = [];
  for (let i = 0; byIndex.has(i); i++) {
    labels.push(byIndex.get(i)!);
  }
  return labels;
}
