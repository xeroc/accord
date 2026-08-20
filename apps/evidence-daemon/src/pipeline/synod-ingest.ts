/**
 * Synod ingest pipeline: `POST /evidence/synod/{case}/{party}` (bean
 * accord-1viq — rewritten scope of accord-ybuq; milestone accord-daq8).
 *
 * Pre-dispute grouping by external PDA: N parties push encrypted evidence
 * bundles for a SynodCase BEFORE any Accord dispute exists, grouped by
 * case PDA + party slot. The grouping rides the existing EvidenceStore key
 * layout `{subaccord}/{dispute}/{round}` with `dispute := case PDA` and
 * `round := party slot` — a SynodCase PDA (owned by the synod program) can
 * never collide with an Accord Dispute PDA (owned by the accord program), so
 * dispute-keyed evidence and synod groups share one store with zero trait
 * changes. `store.group(case)` = per-slot `get(0..party_count-1)`.
 *
 * Trust model — pushes are UNAUTHENTICATED BY DESIGN: the on-chain per-party
 * hash committed at `join` IS the commit (`SynodCase.evidence[slot]`), and
 * junk bundles fail the post-file root verification (sibling accord-lry5).
 * The only chain gates here:
 *   - case must exist → `404`,
 *   - `party` must be a live roster slot (`< party_count`) → `400`,
 *   - `SynodCase.dispute` bound (non-default) → `409` — the case is Live and
 *     the evidence set is frozen.
 *
 * Per-slot idempotency mirrors the dispute-keyed ingest: same
 * `plaintext_hash` re-put ⇒ `201` idempotent; a different hash for a slot
 * already filled ⇒ `409`.
 *
 * Crypto unchanged (ADR-0015): the bundle is the standard ciphertext-only
 * wire shape; `ingested_at` is stamped server-side.
 */
import { bytesEqual, type EvidenceBundle, type IngestStore } from "./ingest.js";

/** Minimal read view of an on-chain `SynodCase` that synod ingest needs. */
export interface SynodCaseView {
  /** Hosting Subaccord — the store-key prefix + operator-key selector. */
  subaccord: Uint8Array;
  /** Number of live parties (2..7); valid slots are `0..party_count-1`. */
  party_count: number;
  /**
   * The bound Accord Dispute PDA; all-zero sentinel while the case is
   * pre-file. Non-zero ⇒ pushes are refused (409).
   */
  dispute: Uint8Array;
}

/** Chain-reader port — the real reader (`readSynodCase`) satisfies this. */
export interface SynodIngestChainReader {
  readSynodCase(casePda: Uint8Array): Promise<SynodCaseView | null>;
}

export interface SynodIngestDeps {
  /** Same storage port as dispute-keyed ingest — the key triple is (subaccord, case, slot). */
  store: IngestStore;
  chain: SynodIngestChainReader;
}

export type SynodIngestOutcome =
  | { status: 201; idempotent: boolean }
  | { status: 400; reason: string }
  | { status: 404; reason: string }
  | { status: 409; reason: string };

const PUBKEY_LEN = 32;
const HASH_LEN = 32;

function isZero32(b: Uint8Array): boolean {
  return b.length === PUBKEY_LEN && b.every((v) => v === 0);
}

/**
 * Validate and store a party's evidence bundle for `casePda` at roster slot
 * `party`. The bundle's `subaccord`/`dispute`/`round` fields are authoritative
 * FROM THE CHAIN CASE (never client-supplied): the caller passes the parsed
 * wire bundle whose keying fields are overwritten before the store put.
 */
export async function synodIngest(
  casePda: Uint8Array,
  party: number,
  bundle: EvidenceBundle,
  deps: SynodIngestDeps,
): Promise<SynodIngestOutcome> {
  if (!Number.isInteger(party) || party < 0) {
    return { status: 400, reason: "invalid party slot" };
  }
  if (casePda.length !== PUBKEY_LEN) {
    return { status: 400, reason: "invalid case pubkey" };
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

  const cv = await deps.chain.readSynodCase(casePda);
  if (cv === null) {
    return { status: 404, reason: "case not found" };
  }
  if (party >= cv.party_count) {
    return { status: 400, reason: `party slot ${party} >= party_count ${cv.party_count}` };
  }
  if (!isZero32(cv.dispute)) {
    return { status: 409, reason: "dispute already filed for this case" };
  }

  // Keying is chain-derived: subaccord from the case, dispute := case PDA,
  // round := party slot. Client-supplied keying fields are never trusted.
  const keyed: EvidenceBundle = {
    ...bundle,
    subaccord: cv.subaccord,
    dispute: casePda,
    round: party,
    ingested_at: Date.now(),
  };

  const existing = await deps.store.get(cv.subaccord, casePda, party);
  if (existing !== null) {
    if (bytesEqual(existing.plaintext_hash, bundle.plaintext_hash)) {
      return { status: 201, idempotent: true };
    }
    return {
      status: 409,
      reason: `a different plaintext_hash already exists for party slot ${party}`,
    };
  }

  await deps.store.put(keyed);
  return { status: 201, idempotent: false };
}
