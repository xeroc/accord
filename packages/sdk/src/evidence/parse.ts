/**
 * parse.ts — parse the `accord-evidence/v1` manifest returned by the evidence
 * daemon (`useManifest`). Shared by `EvidenceManifest` (full render) and any
 * feature that needs a slice of the manifest (e.g. option labels for voting).
 *
 * The manifest is YAML (produced by `buildManifest`); the daemon may return it
 * as a raw UTF-8 string or as a parsed JSON object. This targeted parser needs
 * no YAML dependency.
 */

export interface ParsedManifest {
  /** Top-level `schema:` value; "" when absent (pre-schema bytes). The daemon
   * dispatches multifile on schema + entries (milestone accord-5d0r). */
  schema: string;
  title: string;
  /** Markdown claim body; "" when absent (pre-`description` manifests). */
  description: string;
  filedAt: string;
  filer: string;
  subaccord: string;
  dispute: string;
  optionSalt: string;
  options: { index: number; label: string }[];
  entries: { path: string; sha256: string }[];
}
/** Flow-map scalar: `"quoted"` wins; else the run up to `,`/`}`, trimmed. */
function scalar(item: string, key: string): string {
  const quoted = item.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1];
  if (quoted !== undefined) return quoted;
  return item.match(new RegExp(`${key}:\\s*([^,}]+)`))?.[1]?.trim() ?? "";
}


/** Parse the `accord-evidence/v1` YAML format (produced by `buildManifest`). */
export function parseManifest(text: string): ParsedManifest {
  const lines = text.split("\n");
  const getField = (key: string): string | undefined =>
    lines
      .find((l) => l.startsWith(`${key}: `))
      ?.slice(`${key}: `.length)
      .replace(/^"(.*)"$/, "$1");

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

    const item = line.slice("  - ".length);
    if (section === "options") {
      const index = Number(item.match(/index:\s*(\d+)/)?.[1] ?? -1);
      const label = item.match(/label:\s*"([^"]*)"/)?.[1] ?? "";
      options.push({ index, label });
    } else if (section === "entries") {
      // Quoted (buildManifest emits yamlQuote) or unquoted scalar (riprap
      // wizard) — both valid up to the row's `,`/`}` delimiter.
      const path = scalar(item, "path");
      const sha256 = scalar(item, "sha256");
      entries.push({ path, sha256 });
    }
  }

  // description is JSON-escaped on a single line (see buildManifest); getField
  // strips the outer quotes, so re-quote + JSON.parse to unescape markdown.
  // Total function: malformed bytes fall back to the raw string — callers at
  // trust boundaries reject the manifest, the parser never throws.
  const descriptionRaw = getField("description");
  let description = descriptionRaw ?? "";
  if (descriptionRaw) {
    try {
      description = JSON.parse(`"${descriptionRaw}"`) as string;
    } catch {
      description = descriptionRaw;
    }
  }

  return {
    schema: getField("schema") ?? "",
    title: getField("title") ?? "Untitled dispute",
    description,
    filedAt: getField("filed_at") ?? "—",
    filer: getField("filer") ?? "—",
    subaccord: getField("subaccord") ?? "—",
    dispute: getField("dispute") ?? "—",
    optionSalt: getField("option_salt") ?? "—",
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
  if (manifest == null) return [];
  const parsed =
    typeof manifest === "string"
      ? parseManifest(manifest)
      : parseManifest(JSON.stringify(manifest));

  const byIndex = new Map<number, string>();
  for (const o of parsed.options) {
    if (o.index >= 0) byIndex.set(o.index, o.label);
  }

  const labels: string[] = [];
  for (let i = 0; i < parsed.options.length; i++) {
    const label = byIndex.get(i);
    if (typeof label === "string" && label.trim()) {
      labels.push(label);
    } else {
      break;
    }
  }
  return labels;
}
