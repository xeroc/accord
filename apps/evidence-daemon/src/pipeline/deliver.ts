/**
 * Delivery pipeline: `GET /evidence/{dispute}/for/{juror}`.
 *
 * Per-round evidence-on-appeal (ADR-0023): a juror drawn in round N receives
 * every non-zero manifest from round 0 through round N, each re-encrypted as a
 * separate package. For each round the daemon confirms it operates the
 * Subaccord, loads that round's stored ciphertext bundle, decrypts **in
 * memory**, runs the per-round integrity gate against `evidence_hashes[k]`,
 * applies the watermark seam, and re-encrypts to the juror's X25519 key.
 * Plaintext exists only ephemerally and is never persisted.
 *
 * The HTTP layer (server/routes.ts) base58-decodes the path params and calls
 * `deliver()`; this module owns the orchestration and the 404/409 decisions,
 * and holds no I/O — store, chain, keyring, crypto, and watermark are injected.
 *
 * Outcomes (SPEC §HTTP API, HANDOFF §3):
 *   - `200 { rounds: [{ round, out, operator_ephem_pub }] }` — one re-encrypted
 *     package per non-zero evidence hash in `evidence_hashes[0..=current_round]`,
 *     round-ascending,
 *   - `404` — dispute/subaccord/bundle missing, unknown operator, or juror not
 *     drawn (covers "premature": dispute not yet drawn), per SPEC the `Round`
 *     account is authoritative for the drawn set,
 *   - `409` — any round's integrity-gate failure
 *     (`sha256(plaintext) != evidence_hashes[k]`) or an undecryptable/tampered
 *     stored bundle. A gate failure is tampering — the whole delivery fails, no
 *     partial set is returned.
 *
 * Sentinel: `[0u8;32]` at a slot means "no new evidence this round" (ADR-0023) —
 * the slot is skipped and no bundle is fetched for it.
 *
 * Pull + no-auth is safe (ADR-0006): each round's `reencryptToJuror` targets the
 * juror pubkey, so every returned `out` is decryptable only by the juror key.
 * Do NOT add request auth.
 */
import { NoOpWatermark, type Watermark } from "./watermark";
import type { EvidenceBundle } from "./ingest";

export interface SubaccordView {
  evidence_operator: Uint8Array;
}

export interface RoundView {
  jurors: Uint8Array[];
}

/**
 * Per-dispute delivery view. `evidence_hashes` is the ADR-0023 on-chain array
 * (round 0 = filer; `evidence_hashes[k] == [0u8;32]` = sentinel); the loop is
 * bounded by `current_round + 1` (the juror's round).
 */
export interface DisputeView {
  subaccord: Uint8Array;
  evidence_hashes: Uint8Array[];
  current_round: number;
}

export interface DeliverChainReader {
  readDispute(dispute: Uint8Array): Promise<DisputeView | null>;
  readSubaccord(subaccord: Uint8Array): Promise<SubaccordView | null>;
  readRound(dispute: Uint8Array): Promise<RoundView | null>;
}

export interface DeliverStore {
  /** Fetch the round-`k` ciphertext bundle, or `null` if none is stored. */
  get(subaccord: Uint8Array, dispute: Uint8Array, round: number): Promise<EvidenceBundle | null>;
}

export interface Keyring {
  forOperator(operatorPubkey: Uint8Array): Promise<Uint8Array | null>;
}

export interface DeliveryCrypto {
  // Async: real primitives are Web-Crypto (SHA-256, AES-GCM, X25519). The pure
  // pipeline `await`s each; unit tests inject async stubs.
  sha256(data: Uint8Array): Promise<Uint8Array>;
  unwrap(
    bundle: EvidenceBundle,
    operatorSecret: Uint8Array,
  ): Promise<{ plaintext: Uint8Array } | null>;
  reencryptToJuror(
    watermarked: Uint8Array,
    jurorPubkey: Uint8Array,
  ): Promise<{ out: Uint8Array; operator_ephem_pub: Uint8Array }>;
}

export interface DeliverDeps {
  store: DeliverStore;
  chain: DeliverChainReader;
  keyring: Keyring;
  crypto: DeliveryCrypto;
  watermark?: Watermark;
}

/** One round's re-encrypted package. */
export interface DeliveredRound {
  round: number;
  out: Uint8Array;
  operator_ephem_pub: Uint8Array;
}

export type DeliverOutcome =
  | { status: 200; rounds: DeliveredRound[] }
  | { status: 404; reason: string }
  | { status: 409; reason: string };

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** `[0u8;32]` ADR-0023 sentinel — "no new evidence this round". */
function isZero(h: Uint8Array): boolean {
  for (let i = 0; i < h.length; i++) if (h[i] !== 0) return false;
  return true;
}

export async function deliver(
  dispute: Uint8Array,
  juror: Uint8Array,
  deps: DeliverDeps,
): Promise<DeliverOutcome> {
  const wm = deps.watermark ?? NoOpWatermark;

  const dv = await deps.chain.readDispute(dispute);
  if (dv === null) return { status: 404, reason: "dispute not found" };

  const sub = await deps.chain.readSubaccord(dv.subaccord);
  if (sub === null) return { status: 404, reason: "subaccord not found" };

  const operatorSk = await deps.keyring.forOperator(sub.evidence_operator);
  if (operatorSk === null) return { status: 404, reason: "unknown evidence operator" };

  const round = await deps.chain.readRound(dispute);
  if (round === null) return { status: 404, reason: "dispute not yet drawn" };
  if (!round.jurors.some((j) => bytesEqual(j, juror))) {
    return { status: 404, reason: "juror not drawn for this dispute" };
  }

  // Per-round delivery loop (ADR-0023): iterate evidence_hashes[0..=current_round],
  // skip the [0u8;32] sentinel, integrity-gate each round's plaintext against its
  // own hash, and re-encrypt each as a separate package. A gate failure is
  // tampering — fail the whole delivery (409), return nothing partial.
  const bound = Math.min(dv.current_round + 1, dv.evidence_hashes.length);
  const delivered: DeliveredRound[] = [];
  for (let k = 0; k < bound; k++) {
    const h = dv.evidence_hashes[k]!;
    if (isZero(h)) continue; // sentinel: no new evidence this round

    const bundle = await deps.store.get(dv.subaccord, dispute, k);
    if (bundle === null) {
      return { status: 404, reason: `no evidence ingested for round ${k}` };
    }

    const unwrapped = await deps.crypto.unwrap(bundle, operatorSk);
    if (unwrapped === null) {
      return { status: 409, reason: `round ${k}: ciphertext undecryptable (tampered bundle)` };
    }
    const plaintext = unwrapped.plaintext;

    if (!bytesEqual(await deps.crypto.sha256(plaintext), h)) {
      return {
        status: 409,
        reason: `round ${k}: integrity gate failed (sha256 != evidence_hashes[${k}])`,
      };
    }

    const watermarked = wm.apply(plaintext, juror);
    const { out, operator_ephem_pub } = await deps.crypto.reencryptToJuror(watermarked, juror);
    delivered.push({ round: k, out, operator_ephem_pub });
  }

  if (delivered.length === 0) {
    return { status: 404, reason: "no evidence ingested for dispute" };
  }

  return { status: 200, rounds: delivered };
}
