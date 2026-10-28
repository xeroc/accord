/**
 * evidence/trace.ts — jury telemetry push signature (ADR-0037).
 *
 * The juror hot key (the same Ed25519 key that commits) signs every pushed
 * trace batch: `sig = Ed25519(juror key) over sha256(canonical JSON of
 * {v, juror, dispute, seq, events})` — canonical JSON = object keys sorted
 * recursively, no whitespace. Shared by the jurat TraceSink (signs) and the
 * evidence daemon ingest pipeline (verifies against the live `Round.jurors[]`
 * set); there is exactly one implementation of the canonical form.
 *
 * The signed object deliberately excludes `subaccord` (derivable from the
 * dispute), `at` (daemon-stamped arrival time) and the signature itself —
 * a re-push of the same seq re-verifies byte-identically.
 *
 * Authority: ADR-0037 §2 (data contract); apps/evidence-daemon/SPEC.md.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";

const te = new TextEncoder();

/** The signed batch fields — exactly the canonical object of ADR-0037 §2. */
export interface TraceBatchMessage {
  readonly v: 1;
  /** Juror address (base58 string, as routed). */
  readonly juror: string;
  /** Dispute address (base58 string, as routed). */
  readonly dispute: string;
  /** Per-juror monotonic batch number. */
  readonly seq: number;
  /** Event records — opaque here, canonicalized verbatim. */
  readonly events: readonly unknown[];
}

/**
 * Canonical JSON: object keys sorted recursively (byte-wise), no whitespace,
 * arrays order-preserving. Primitives via `JSON.stringify` (string quoting,
 * number formatting). `undefined` mirrors `JSON.stringify` exactly — object
 * entries with an `undefined` value are skipped, array elements render as
 * `null` — because the signer canonicalizes the IN-MEMORY batch while the
 * daemon re-canonicalizes the parsed wire body, and only a JSON.stringify-
 * stable form hashes identically on both sides. (ai@7's usage normalization
 * materializes optional fields as explicit `undefined`; skipping them here
 * is what keeps step-event batches verifying.)
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) as string;
  if (Array.isArray(value)) {
    return `[${value.map((el) => canonicalJson(el ?? null)).join(",")}]`;
  }
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The signed message: sha256 digest of the canonical batch JSON. */
export function buildTraceBatchMessage(b: TraceBatchMessage): Uint8Array {
  return nobleSha256(te.encode(canonicalJson(b)));
}

/**
 * Daemon-shared verification of a trace batch signature: Ed25519 by the
 * juror's Solana key over {@link buildTraceBatchMessage}. Returns false for a
 * bad signature OR malformed key/sig lengths (the daemon maps false → 403).
 */
export function verifyTraceBatchSig(
  jurorEd25519Pub: Uint8Array,
  b: TraceBatchMessage,
  sig: Uint8Array,
): boolean {
  if (jurorEd25519Pub.length !== 32 || sig.length !== 64) return false;
  try {
    return ed25519.verify(sig, buildTraceBatchMessage(b), jurorEd25519Pub);
  } catch {
    return false;
  }
}
