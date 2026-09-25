/**
 * Ingest pipeline: `POST /evidence/{subaccord}/{dispute}[/{round}]`.
 *
 * Receives a claimant-posted `EvidenceBundle` (**ciphertext only** — no
 * plaintext field exists), validates it against the on-chain `Dispute`, and
 * stores the ciphertext idempotently. The HTTP layer (server/routes.ts) parses
 * the request body (base58 → bytes) and calls `ingest()`; this module is the
 * pure pipeline logic and owns no I/O — all I/O is injected via ports.
 *
 * Per-round evidence-on-appeal (ADR-0023): the `round` path param selects
 * which slot of `Dispute.evidence_hashes` the bundle is gated against.
 * Round 0 (default) is the filer's evidence; round 1..MAX_APPEALS is appeal
 * evidence. The integrity gate is `bundle.plaintext_hash ==
 * dispute.evidence_hashes[round]`; an out-of-bounds round or a `[0u8;32]`
 * sentinel slot yields a mismatch → `400`.
 *
 * v1 scope of this bean (accord-r9km):
 *   - structural validation of the bundle → `400` on malformed,
 *   - metadata integrity: `bundle.plaintext_hash == evidence_hashes[round]`
 *     (and path/bundle/chain consistency) → `400` on mismatch,
 *   - idempotent `store.put`: `201` (new or same-hash re-put) / `409` (a
 *     different `plaintext_hash` already exists for this dispute+round),
 *   - `404` when the dispute is not found on-chain.
 *
 * v2 (milestone accord-5d0r) — the decrypt-and-verify gate formerly out of
 * scope is IN: the daemon holds the operator keyring, so POST proves the
 * ciphertext decrypts to its own `plaintext_hash` before storage, then parses
 * the manifest and validates `entries[]` (schema dispatch, path hygiene,
 * uniqueness, limits). URL-path and all-zero-sentinel entries are born
 * satisfied (format §2) — not stored, not validated. Manifests with no
 * entries keep v1 manifest-only semantics. Per-file document upload is
 * `ingestFile()`; the mandatory delivery-time integrity gate (deliver.ts)
 * is unchanged and remains the juror-facing authority.
 *
 * Encrypted-at-rest invariant: the stored object is the bundle as received —
 * ciphertext only. `ingest()` decrypts transiently to verify and parse, and
 * never persists plaintext.
 */

import { parseManifest } from "@useaccord/sdk/evidence";
import { type FileStat, isSafeEntryPath } from "../store/store.js";

/**
 * Manifest schemas the daemon dispatches for multifile (milestone
 * accord-5d0r). An unknown schema WITH entries is a loud 400 at POST — never
 * a silent degrade to manifest-only that would strand jurors mid-dispute.
 */
const MULTIFILE_SCHEMA: Record<string, true> = {
  "accord-evidence/v1": true,
  "riprap-claim/v1": true,
};

/** Leaf hash: 64 lowercase hex chars. */
const LEAF_HEX = /^[0-9a-f]{64}$/;
/** All-zero sentinel (format §2) — entry skips leaf verification. Shared with deliver.ts. */
export const SENTINEL_HEX = "0".repeat(64);
/** RFC-3986-ish scheme prefix ⇒ out-of-band URL entry (not daemon-stored). Shared with deliver.ts. */
export const URL_PATH = /^[a-z][a-z0-9+.-]*:/i;
export interface EvidenceBundle {
  subaccord: Uint8Array;
  dispute: Uint8Array;
  /** Evidence round (ADR-0023): 0 = filer, 1..MAX_APPEALS = appeal rounds. */
  round: number;
  ct: Uint8Array;
  claimant_ephem_pub: Uint8Array;
  wrapped: Uint8Array;
  plaintext_hash: Uint8Array;
  ingested_at: number;
}

/**
 * Minimal read view of an on-chain `Dispute` that ingest needs. The full
 * ADR-0023 per-round array is exposed so the integrity gate can target
 * `evidence_hashes[round]`.
 */
export interface DisputeView {
  subaccord: Uint8Array;
  /** Per-round commitments; index `round` is this bundle's gate target. */
  evidence_hashes: Uint8Array[];
}

/** Storage port — the real `S3Store` (bean accord-xrdc) satisfies this. */
export interface IngestStore {
  exists(subaccord: Uint8Array, dispute: Uint8Array, round: number): Promise<boolean>;
  get(subaccord: Uint8Array, dispute: Uint8Array, round: number): Promise<EvidenceBundle | null>;
  put(bundle: EvidenceBundle): Promise<void>;
  /** v2 multifile (accord-5d0r): per-document objects keyed by entry path. */
  putFile(bundle: EvidenceBundle, path: string): Promise<void>;
  getFile(
    subaccord: Uint8Array,
    dispute: Uint8Array,
    round: number,
    path: string,
  ): Promise<EvidenceBundle | null>;
  listFiles(subaccord: Uint8Array, dispute: Uint8Array, round: number): Promise<FileStat[]>;
}

/** Chain-reader port — the real reader (bean accord-mwfq) satisfies this. */
export interface IngestChainReader {
  readDispute(dispute: Uint8Array): Promise<DisputeView | null>;
  /** The subaccord's evidence operator — selects the decrypt key (v2). */
  readSubaccord(subaccord: Uint8Array): Promise<{ evidence_operator: Uint8Array } | null>;
}

/** Operator keyring port — `EnvKeyring` satisfies this. */
export interface IngestKeyring {
  forOperator(operatorPubkey: Uint8Array): Promise<Uint8Array | null>;
}

/** Crypto port — the real ECIES adapter in wire.ts satisfies this. */
export interface IngestCrypto {
  sha256(data: Uint8Array): Promise<Uint8Array>;
  /** `null` = undecryptable (tampered bundle / wrong operator). */
  unwrap(
    bundle: EvidenceBundle,
    operatorSecret: Uint8Array,
  ): Promise<{ plaintext: Uint8Array } | null>;
}

/** v2 limits — config, not code (pilot-calibrated, milestone accord-5d0r). */
export interface IngestLimits {
  /** Max manifest entries per round (URL + sentinel included). */
  readonly maxEntries: number;
  /** Max per-document ciphertext bytes on PUT → 413. */
  readonly maxDocBytes: number;
  /** Max cumulative stored bytes per round → 413. */
  readonly maxPackageBytes: number;
}

export interface IngestDeps {
  store: IngestStore;
  chain: IngestChainReader;
  keyring: IngestKeyring;
  crypto: IngestCrypto;
  limits: IngestLimits;
}

export type IngestOutcome =
  | { status: 201; idempotent: boolean }
  | { status: 400; reason: string }
  | { status: 404; reason: string }
  | { status: 409; reason: string };

const PUBKEY_LEN = 32;
const HASH_LEN = 32;

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function isPubkey(b: Uint8Array): boolean {
  return b.length === PUBKEY_LEN;
}

/**
 * Validate and store a claimant evidence bundle for `round`. `subaccord`/
 * `dispute` are the URL path parameters (already base58-decoded by the route
 * layer); `round` is the evidence round (0 = filer, 1..MAX_APPEALS = appeal);
 * `bundle` is the parsed request body. `ingested_at` is stamped server-side
 * (the client value is ignored) so a claimant cannot forge ingestion timing.
 */
export async function ingest(
  subaccord: Uint8Array,
  dispute: Uint8Array,
  round: number,
  bundle: EvidenceBundle,
  deps: IngestDeps,
): Promise<IngestOutcome> {
  if (!Number.isInteger(round) || round < 0) {
    return { status: 400, reason: "invalid round" };
  }
  if (!isPubkey(subaccord) || !isPubkey(dispute)) {
    return { status: 400, reason: "invalid path pubkey" };
  }
  if (!bytesEqual(bundle.subaccord, subaccord) || !bytesEqual(bundle.dispute, dispute)) {
    return { status: 400, reason: "path/bundle subaccord|dispute mismatch" };
  }
  if (bundle.round !== round) {
    return { status: 400, reason: "path/bundle round mismatch" };
  }
  if (!isPubkey(bundle.subaccord) || !isPubkey(bundle.dispute)) {
    return { status: 400, reason: "invalid bundle pubkey" };
  }
  if (bundle.ct.length === 0) {
    return { status: 400, reason: "empty ciphertext" };
  }
  if (bundle.claimant_ephem_pub.length !== PUBKEY_LEN) {
    return { status: 400, reason: "claimant_ephem_pub must be 32 bytes" };
  }
  if (bundle.wrapped.length === 0) {
    return { status: 400, reason: "empty wrapped DEK" };
  }
  if (bundle.plaintext_hash.length !== HASH_LEN) {
    return { status: 400, reason: "plaintext_hash must be 32 bytes" };
  }

  const dv = await deps.chain.readDispute(dispute);
  if (dv === null) {
    return { status: 404, reason: "dispute not found" };
  }
  if (!bytesEqual(dv.subaccord, subaccord)) {
    return { status: 400, reason: "dispute does not belong to subaccord" };
  }
  const slotHash = dv.evidence_hashes[round];
  if (slotHash === undefined || !bytesEqual(slotHash, bundle.plaintext_hash)) {
    return { status: 400, reason: `plaintext_hash != evidence_hashes[${round}]` };
  }

  const existing = await deps.store.get(subaccord, dispute, round);
  if (existing !== null) {
    if (bytesEqual(existing.plaintext_hash, bundle.plaintext_hash)) {
      return { status: 201, idempotent: true };
    }
    return {
      status: 409,
      reason: `a different plaintext_hash already exists for this dispute round ${round}`,
    };
  }

  // ---- v2 decrypt-and-verify gate (milestone accord-5d0r) ----
  // The daemon holds the operator keyring, so POST now proves the ciphertext
  // decrypts to its own plaintext_hash before anything is stored — the
  // deferred ingest half of bean accord-vknh's gate. Runs AFTER the
  // idempotency check: an honest re-POST of the same hash is a no-op without
  // re-decrypting.
  const sub = await deps.chain.readSubaccord(subaccord);
  const operatorSk = sub === null ? null : await deps.keyring.forOperator(sub.evidence_operator);
  const unwrapped = operatorSk === null ? null : await deps.crypto.unwrap(bundle, operatorSk);
  if (unwrapped === null) {
    return { status: 400, reason: "manifest undecryptable (tampered bundle or unknown operator)" };
  }
  if (!bytesEqual(await deps.crypto.sha256(unwrapped.plaintext), bundle.plaintext_hash)) {
    return { status: 400, reason: "decrypt-verify failed: sha256(plaintext) != plaintext_hash" };
  }

  // ---- v2 multifile dispatch (EVIDENCE-FORMAT §7.1, loose per-file) ----
  const parsed = parseManifest(new TextDecoder().decode(unwrapped.plaintext));
  const entries = parsed.entries;
  if (entries.length > 0) {
    if (parsed.schema === "" || MULTIFILE_SCHEMA[parsed.schema] !== true) {
      return { status: 400, reason: `unknown multifile schema: ${parsed.schema || "(absent)"}` };
    }
    if (entries.length > deps.limits.maxEntries) {
      return {
        status: 400,
        reason: `too many entries: ${entries.length} > ${deps.limits.maxEntries}`,
      };
    }
    const seen = new Set<string>();
    for (const e of entries) {
      if (!LEAF_HEX.test(e.sha256)) {
        return {
          status: 400,
          reason: `entry ${JSON.stringify(e.path)}: sha256 must be 64 lowercase hex or the all-zero sentinel`,
        };
      }
      // URL paths and all-zero sentinels are born satisfied (format §2) —
      // out-of-band payloads the daemon never stores or validates.
      if (URL_PATH.test(e.path) || e.sha256 === SENTINEL_HEX) continue;
      if (!isSafeEntryPath(e.path)) {
        return { status: 400, reason: `unsafe entry path: ${JSON.stringify(e.path)}` };
      }
      if (seen.has(e.path)) {
        return { status: 400, reason: `duplicate entry path: ${JSON.stringify(e.path)}` };
      }
      seen.add(e.path);
    }
  }
  // entries.length === 0 ⇒ manifest-only mode (v1 semantics): nothing to
  // track, the round is complete the moment the manifest is stored.
  await deps.store.put({ ...bundle, ingested_at: Date.now() });
  return { status: 201, idempotent: false };
}

export type IngestFileOutcome =
  | { status: 201; idempotent: boolean }
  | { status: 400; reason: string }
  | { status: 404; reason: string }
  | { status: 409; reason: string }
  | { status: 413; reason: string };

/** Hex (64 lowercase chars) → 32 bytes; `null` when not valid leaf hex. */
function hexToBytes32(hex: string): Uint8Array | null {
  if (!LEAF_HEX.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * PUT one document of a multifile package (milestone accord-5d0r): gate order
 * is manifest-first (404), tracked-entry (400), leaf-hash (400, checked
 * WITHOUT decrypting), idempotency (201/409), limits (413), then
 * decrypt-verify (400) before the store write. Unauthenticated but
 * content-gated: only bytes hashing to the manifest leaf — itself anchored
 * on-chain via the manifest root — can ever land, so a racing writer with
 * correct bytes is a no-op and incorrect bytes can never store.
 */
export async function ingestFile(
  subaccord: Uint8Array,
  dispute: Uint8Array,
  round: number,
  path: string,
  bundle: EvidenceBundle,
  deps: IngestDeps,
): Promise<IngestFileOutcome> {
  if (!Number.isInteger(round) || round < 0) {
    return { status: 400, reason: "invalid round" };
  }
  if (!isPubkey(subaccord) || !isPubkey(dispute)) {
    return { status: 400, reason: "invalid path pubkey" };
  }
  if (!bytesEqual(bundle.subaccord, subaccord) || !bytesEqual(bundle.dispute, dispute)) {
    return { status: 400, reason: "path/bundle subaccord|dispute mismatch" };
  }
  if (bundle.round !== round) {
    return { status: 400, reason: "path/bundle round mismatch" };
  }
  if (!isSafeEntryPath(path)) {
    return { status: 400, reason: `unsafe entry path: ${JSON.stringify(path)}` };
  }
  if (bundle.ct.length === 0) {
    return { status: 400, reason: "empty ciphertext" };
  }
  if (bundle.claimant_ephem_pub.length !== PUBKEY_LEN) {
    return { status: 400, reason: "claimant_ephem_pub must be 32 bytes" };
  }
  if (bundle.wrapped.length === 0) {
    return { status: 400, reason: "empty wrapped DEK" };
  }
  if (bundle.plaintext_hash.length !== HASH_LEN) {
    return { status: 400, reason: "plaintext_hash must be 32 bytes" };
  }

  // Manifest-first is structural: no manifest, no file namespace.
  const manifest = await deps.store.get(subaccord, dispute, round);
  if (manifest === null) {
    return {
      status: 404,
      reason: `no manifest ingested for round ${round} — POST the manifest first`,
    };
  }

  // The stored manifest was decrypt-verified at POST; failing now means
  // tampered storage or a keyring mismatch — a conflict, not client error.
  const sub = await deps.chain.readSubaccord(subaccord);
  const operatorSk = sub === null ? null : await deps.keyring.forOperator(sub.evidence_operator);
  const mUnwrapped = operatorSk === null ? null : await deps.crypto.unwrap(manifest, operatorSk);
  if (mUnwrapped === null || operatorSk === null) {
    return {
      status: 409,
      reason: "stored manifest undecryptable (tampered storage or unknown operator)",
    };
  }
  const entry = parseManifest(new TextDecoder().decode(mUnwrapped.plaintext)).entries.find(
    (e) => e.path === path && !URL_PATH.test(e.path) && e.sha256 !== SENTINEL_HEX,
  );
  if (entry === undefined) {
    return { status: 400, reason: `path not tracked in manifest: ${JSON.stringify(path)}` };
  }
  const leaf = hexToBytes32(entry.sha256);
  if (leaf === null || !bytesEqual(bundle.plaintext_hash, leaf)) {
    return {
      status: 400,
      reason: `plaintext_hash != manifest leaf sha256 for ${JSON.stringify(path)}`,
    };
  }

  // Idempotency before the doc decrypt: an honest re-PUT of the same hash
  // (fresh ephemeral key, same plaintext) is a no-op without re-decrypting.
  const existing = await deps.store.getFile(subaccord, dispute, round, path);
  if (existing !== null) {
    if (bytesEqual(existing.plaintext_hash, bundle.plaintext_hash)) {
      return { status: 201, idempotent: true };
    }
    return {
      status: 409,
      reason: `a different plaintext_hash is already stored for ${JSON.stringify(path)}`,
    };
  }

  if (bundle.ct.length > deps.limits.maxDocBytes) {
    return {
      status: 413,
      reason: `document exceeds cap: ${bundle.ct.length} > ${deps.limits.maxDocBytes} bytes`,
    };
  }
  const stored = await deps.store.listFiles(subaccord, dispute, round);
  // ponytail: package cap = stored object bytes + this ct length; the JSON/
  // base64 storage overhead is ignored — a liability bound, not billing.
  const pkgBytes = stored.reduce((n, f) => n + f.bytes, 0) + bundle.ct.length;
  if (pkgBytes > deps.limits.maxPackageBytes) {
    return {
      status: 413,
      reason: `package cap exceeded: ${pkgBytes} > ${deps.limits.maxPackageBytes} bytes`,
    };
  }

  const unwrapped = await deps.crypto.unwrap(bundle, operatorSk);
  if (unwrapped === null) {
    return { status: 400, reason: "document undecryptable (tampered bundle)" };
  }
  if (!bytesEqual(await deps.crypto.sha256(unwrapped.plaintext), bundle.plaintext_hash)) {
    return { status: 400, reason: "decrypt-verify failed: sha256(plaintext) != plaintext_hash" };
  }

  await deps.store.putFile({ ...bundle, ingested_at: Date.now() }, path);
  return { status: 201, idempotent: false };
}
