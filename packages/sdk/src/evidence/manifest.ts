/**
 * evidence/manifest.ts — serialize the `accord-evidence/v1` manifest into a
 * single deterministic Uint8Array buffer. That one buffer feeds the YAML
 * preview, `sha256`→`evidence_hash`, and `claimantEncrypt`→POST. Never
 * re-serialize.
 *
 * Authority: EVIDENCE-FORMAT.md §2 (no canonicalization needed — manifest
 * delivered verbatim), §3 (schema — `description` field added per ADR-0017).
 */
import type { Address } from "@solana/kit";

/** All-zero `[u8;32]` sentinel — juror skips leaf verification (root gate still applies). */
export const SHA256_ZERO = new Uint8Array(32);

export interface ManifestEntryInput {
  /** URL or relative POSIX path to the evidence resource. */
  path: string;
  /** Leaf sha256 (32 bytes). Defaults to {@link SHA256_ZERO} when unknown. */
  sha256?: Uint8Array;
}

export interface ManifestInput {
  /** Per-dispute 32-byte random salt (app-generated). */
  salt: Uint8Array;
  title: string;
  /**
   * Optional markdown description — the claim body (Canon challenger's
   * argument). Rendered sanitized; raw bytes are never altered.
   * Omitted from YAML when empty/absent (backward-compatible).
   */
  description?: string;
  /** Ordered option labels; `Dispute.options[i] = sha256(salt ‖ utf8(label_i))`. */
  labels: string[];
  entries: ManifestEntryInput[];
}

export interface ManifestCtx {
  dispute: Address;
  subaccord: Address;
  filer: Address;
  /** ISO-8601 UTC timestamp string. */
  filedAt: string;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Minimal YAML double-quote escaping for a string value. */
function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Serialize manifest input + ctx into a single `Uint8Array` (UTF-8 YAML).
 * Hand-serialized — the manifest is a flat object with two list fields; no YAML
 * library needed (EVIDENCE-FORMAT.md §2: no canonicalization, delivered verbatim).
 *
 * The optional `description` field is emitted as a YAML block scalar (`|`)
 * after `title` when present and non-empty. This keeps it backward-compatible:
 * a manifest without `description` is byte-identical to the pre-description format.
 */
export function buildManifest(
  input: ManifestInput,
  ctx: ManifestCtx,
): Uint8Array {
  const lines: string[] = [
    "schema: accord-evidence/v1",
    `dispute: ${ctx.dispute}`,
    `subaccord: ${ctx.subaccord}`,
    `filer: ${ctx.filer}`,
    `filed_at: ${ctx.filedAt}`,
    "language: en",
    `title: ${yamlQuote(input.title)}`,
  ];

  // Description as a YAML literal block scalar (preserves newlines, no escaping needed).
  const desc = input.description?.trim();
  if (desc) {
    lines.push(`description: |`);
    for (const line of desc.split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  lines.push(
    "",
    `option_salt: ${hex(input.salt)}`,
    "options:",
    ...input.labels.map(
      (label, index) => `  - { index: ${index}, label: ${yamlQuote(label)} }`,
    ),
    "",
    "entries:",
    ...input.entries.map(
      (e) =>
        `  - { path: ${yamlQuote(e.path)}, sha256: "${hex(e.sha256 ?? SHA256_ZERO)}" }`,
    ),
  );
  return new TextEncoder().encode(lines.join("\n") + "\n");
}
