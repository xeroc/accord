/**
 * evidence/manifest.ts — single-buffer `accord-evidence/v1` manifest
 * serialization (ADR-0017, EVIDENCE-FORMAT.md §2–3).
 *
 * **Single-buffer invariant (non-negotiable, §3):** `buildManifest`
 * serializes ONCE into one `Uint8Array`. That exact buffer feeds the YAML
 * preview, `sha256` → `evidence_hash`, and `claimantEncrypt` → POST. Never
 * re-serialize — the hash is over the delivered bytes, so a second
 * serialization with different formatting would produce a different hash.
 *
 * No canonicalization rules are needed (EVIDENCE-FORMAT.md §2): the manifest
 * is delivered verbatim to Jurors. Our YAML formatting is deterministic
 * (fixed key order, fixed quoting), which is sufficient for byte-stability.
 *
 * MVP scope (milestone §7): entries carry `{ path, sha256 }` where `path`
 * accepts a URL or relative POSIX path and `sha256` defaults to the all-zero
 * sentinel (`SHA256_ZERO`) — Jurors skip leaf verification, the root gate
 * still applies. No `public` block (v1 ships fully-confidential-only).
 */
import { generateSalt } from "./options.js";

/** All-zero `[u8;32]` sentinel — `sha256` field placeholder (§3.2, §9.3). */
export const SHA256_ZERO: Uint8Array = new Uint8Array(32);

export interface ManifestEntry {
  /** URL or relative POSIX path to the evidence file. */
  path: string;
  /** Leaf sha256 (32 bytes). Defaults to `SHA256_ZERO` (Juror skips leaf check). */
  sha256?: Uint8Array;
}

export interface ManifestInput {
  /** Dispute title (human-readable, one line). */
  title: string;
  /** Ordered option labels — `Dispute.options[i] = sha256(salt ‖ label_i)`. */
  labels: string[];
  /** Evidence file entries (the bill of materials). */
  entries: ManifestEntry[];
  /** 32-byte option salt. Generated if absent (use `generateSalt()`). */
  salt?: Uint8Array;
}

export interface ManifestCtx {
  /** Base58 Dispute pubkey. */
  dispute: string;
  /** Base58 Subaccord pubkey. */
  subaccord: string;
  /** Base58 filer pubkey. */
  filer: string;
  /** ISO-8601 UTC timestamp. */
  filedAt: string;
}

const te = new TextEncoder();

/**
 * Serialize the manifest into a single deterministic `Uint8Array` (UTF-8 YAML).
 * This IS creating `evidence_hash` — `sha256(buildManifest(...))` is the root.
 *
 * The same `(input, ctx)` always produces byte-identical output (modulo the
 * salt, which is random if generated internally — pass `input.salt` for
 * reproducibility).
 */
export function buildManifest(
  input: ManifestInput,
  ctx: ManifestCtx,
): Uint8Array {
  const salt = input.salt ?? generateSalt();
  const lines: string[] = [];

  lines.push(`schema: "accord-evidence/v1"`);
  lines.push(`dispute: ${q(ctx.dispute)}`);
  lines.push(`subaccord: ${q(ctx.subaccord)}`);
  lines.push(`filer: ${q(ctx.filer)}`);
  lines.push(`filed_at: ${q(ctx.filedAt)}`);
  lines.push(`language: "en"`);
  lines.push(`title: ${q(input.title)}`);
  lines.push(`option_salt: ${q(hex(salt))}`);
  lines.push("options:");
  for (let i = 0; i < input.labels.length; i++) {
    lines.push(`  - index: ${i}`);
    lines.push(`    label: ${q(input.labels[i]!)}`);
  }
  lines.push("entries:");
  for (const entry of input.entries) {
    lines.push(`  - path: ${q(entry.path)}`);
    lines.push(`    sha256: ${q(hex(entry.sha256 ?? SHA256_ZERO))}`);
  }

  return te.encode(lines.join("\n") + "\n");
}

function hex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** YAML double-quote with minimal escaping (backslash, quote, newline, CR, tab). */
function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
}
