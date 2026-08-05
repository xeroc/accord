/**
 * Ingest pipeline: `POST /evidence/{subaccord}/{dispute}`.
 *
 * Receives a claimant-posted `EvidenceBundle` (**ciphertext only** — no
 * plaintext field exists), validates it against the on-chain `Dispute`, and
 * stores the ciphertext idempotently. The HTTP layer (server/routes.ts) parses
 * the request body (base58 → bytes) and calls `ingest()`; this module is the
 * pure pipeline logic and owns no I/O — all I/O is injected via ports.
 *
 * v1 scope of this bean (accord-r9km):
 *   - structural validation of the bundle → `400` on malformed,
 *   - metadata integrity: `bundle.plaintext_hash == Dispute.evidence_hash`
 *     (and path/bundle/chain consistency) → `400` on mismatch,
 *   - idempotent `store.put`: `201` (new or same-hash re-put) / `409` (a
 *     different `plaintext_hash` already exists for this dispute),
 *   - `404` when the dispute is not found on-chain.
 *
 * Out of scope here (needs crypto/keyring, bean accord-vknh / accord-11im): a
 * decrypt-and-verify gate that confirms the ciphertext is actually decryptable
 * and that `sha256(plaintext) == evidence_hash` at ingest time. The mandatory
 * integrity gate runs at delivery (deliver.ts); ingest does metadata-only
 * validation per the SPEC happy-path step 2.
 *
 * Encrypted-at-rest invariant: the stored object is the bundle as received —
 * ciphertext only. `ingest()` never constructs or persists plaintext.
 */
export interface EvidenceBundle {
  subaccord: Uint8Array;
  dispute: Uint8Array;
  ct: Uint8Array;
  claimant_ephem_pub: Uint8Array;
  wrapped: Uint8Array;
  plaintext_hash: Uint8Array;
  ingested_at: number;
}

/** Minimal read view of an on-chain `Dispute` that ingest needs. */
export interface DisputeView {
  subaccord: Uint8Array;
  evidence_hash: Uint8Array;
}

/** Storage port — the real `S3Store` (bean accord-xrdc) satisfies this. */
export interface IngestStore {
  exists(subaccord: Uint8Array, dispute: Uint8Array): Promise<boolean>;
  get(
    subaccord: Uint8Array,
    dispute: Uint8Array,
  ): Promise<EvidenceBundle | null>;
  put(bundle: EvidenceBundle): Promise<void>;
}

/** Chain-reader port — the real reader (bean accord-mwfq) satisfies this. */
export interface IngestChainReader {
  readDispute(dispute: Uint8Array): Promise<DisputeView | null>;
}

export interface IngestDeps {
  store: IngestStore;
  chain: IngestChainReader;
}

export type IngestOutcome =
  | { status: 201; idempotent: boolean }
  | { status: 400; reason: string }
  | { status: 404; reason: string }
  | { status: 409; reason: string };

const PUBKEY_LEN = 32;
const HASH_LEN = 32;

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function isPubkey(b: Uint8Array): boolean {
  return b.length === PUBKEY_LEN;
}

/**
 * Validate and store a claimant evidence bundle. `subaccord`/`dispute` are the
 * URL path parameters (already base58-decoded by the route layer); `bundle` is
 * the parsed request body. `ingested_at` is stamped server-side (the client
 * value is ignored) so a claimant cannot forge ingestion timing.
 */
export async function ingest(
  subaccord: Uint8Array,
  dispute: Uint8Array,
  bundle: EvidenceBundle,
  deps: IngestDeps,
): Promise<IngestOutcome> {
  if (!isPubkey(subaccord) || !isPubkey(dispute)) {
    return { status: 400, reason: "invalid path pubkey" };
  }
  if (
    !bytesEqual(bundle.subaccord, subaccord) ||
    !bytesEqual(bundle.dispute, dispute)
  ) {
    return { status: 400, reason: "path/bundle subaccord|dispute mismatch" };
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
  if (!bytesEqual(dv.evidence_hash, bundle.plaintext_hash)) {
    return { status: 400, reason: "plaintext_hash != Dispute.evidence_hash" };
  }

  const existing = await deps.store.get(subaccord, dispute);
  if (existing !== null) {
    if (bytesEqual(existing.plaintext_hash, bundle.plaintext_hash)) {
      return { status: 201, idempotent: true };
    }
    return {
      status: 409,
      reason: "a different plaintext_hash already exists for this dispute",
    };
  }

  await deps.store.put({ ...bundle, ingested_at: Date.now() });
  return { status: 201, idempotent: false };
}
