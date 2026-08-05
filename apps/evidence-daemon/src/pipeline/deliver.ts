/**
 * Delivery pipeline: `GET /evidence/{dispute}/for/{juror}`.
 *
 * Loads the stored ciphertext bundle, confirms the daemon operates the
 * Subaccord, confirms the juror is drawn, decrypts **in memory**, runs the
 * mandatory integrity gate, applies the watermark seam, and re-encrypts to the
 * juror's X25519 key. Plaintext exists only ephemerally and is never persisted.
 *
 * The HTTP layer (server/routes.ts) base58-decodes the path params and calls
 * `deliver()`; this module owns the orchestration and the 404/409 decisions,
 * and holds no I/O — store, chain, keyring, crypto, and watermark are injected.
 *
 * Outcomes (SPEC §HTTP API, HANDOFF §3):
 *   - `200 { out, operator_ephem_pub }` — re-encrypted to the juror key,
 *   - `404` — dispute/subaccord/bundle missing, unknown operator, or juror not
 *     drawn (covers "premature": dispute not yet drawn), per SPEC the `Round`
 *     account is authoritative for the drawn set,
 *   - `409` — integrity-gate failure (`sha256(plaintext) != evidence_hash`) or
 *     an undecryptable/tampered stored bundle.
 *
 * Pull + no-auth is safe (ADR-0006): step `reencryptToJuror` targets the juror
 * pubkey, so the returned `out` is decryptable only by the juror key. Do NOT
 * add request auth.
 */
import { NoOpWatermark, type Watermark } from "./watermark.ts";
import type { EvidenceBundle } from "./ingest.ts";

export interface SubaccordView {
  evidence_operator: Uint8Array;
}

export interface RoundView {
  jurors: Uint8Array[];
}

export interface DeliverChainReader {
  readDispute(
    dispute: Uint8Array,
  ): Promise<{ subaccord: Uint8Array; evidence_hash: Uint8Array } | null>;
  readSubaccord(subaccord: Uint8Array): Promise<SubaccordView | null>;
  readRound(dispute: Uint8Array): Promise<RoundView | null>;
}

export interface DeliverStore {
  get(
    subaccord: Uint8Array,
    dispute: Uint8Array,
  ): Promise<EvidenceBundle | null>;
}

export interface Keyring {
  forOperator(operatorPubkey: Uint8Array): Promise<Uint8Array | null>;
}

export interface DeliveryCrypto {
  sha256(data: Uint8Array): Uint8Array;
  unwrap(
    bundle: EvidenceBundle,
    operatorSecret: Uint8Array,
  ): { plaintext: Uint8Array } | null;
  reencryptToJuror(
    watermarked: Uint8Array,
    jurorPubkey: Uint8Array,
  ): { out: Uint8Array; operator_ephem_pub: Uint8Array };
}

export interface DeliverDeps {
  store: DeliverStore;
  chain: DeliverChainReader;
  keyring: Keyring;
  crypto: DeliveryCrypto;
  watermark?: Watermark;
}

export type DeliverOutcome =
  | { status: 200; out: Uint8Array; operator_ephem_pub: Uint8Array }
  | { status: 404; reason: string }
  | { status: 409; reason: string };

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
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
  if (operatorSk === null)
    return { status: 404, reason: "unknown evidence operator" };

  const bundle = await deps.store.get(dv.subaccord, dispute);
  if (bundle === null)
    return { status: 404, reason: "no evidence ingested for dispute" };

  const round = await deps.chain.readRound(dispute);
  if (round === null) return { status: 404, reason: "dispute not yet drawn" };
  if (!round.jurors.some((j) => bytesEqual(j, juror))) {
    return { status: 404, reason: "juror not drawn for this dispute" };
  }

  const unwrapped = deps.crypto.unwrap(bundle, operatorSk);
  if (unwrapped === null)
    return {
      status: 409,
      reason: "ciphertext undecryptable (tampered bundle)",
    };
  const plaintext = unwrapped.plaintext;

  if (!bytesEqual(deps.crypto.sha256(plaintext), dv.evidence_hash)) {
    return {
      status: 409,
      reason: "integrity gate failed (sha256 != evidence_hash)",
    };
  }

  const watermarked = wm.apply(plaintext, juror);
  const { out, operator_ephem_pub } = deps.crypto.reencryptToJuror(
    watermarked,
    juror,
  );

  return { status: 200, out, operator_ephem_pub };
}
