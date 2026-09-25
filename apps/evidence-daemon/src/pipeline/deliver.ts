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
 * Synod bridge (accord-g1dy): when `Dispute.filer` is a SynodCase PDA bound to
 * this dispute, the evidence source is the pre-dispute GROUP instead of the
 * per-round bundles — see `deliverSynodGroup` below. `round` in a group
 * package carries the party slot.
 *
 * Pull + no-auth is safe (ADR-0006): each round's `reencryptToJuror` targets the
 * juror pubkey, so every returned `out` is decryptable only by the juror key.
 * Do NOT add request auth.
 */
import { parseManifest } from "@useaccord/sdk/evidence";
import { SENTINEL_HEX, URL_PATH } from "./ingest";
import type { FileStat } from "../store/store.js";
import { NoOpWatermark, type Watermark } from "./watermark";
import type { EvidenceBundle } from "./ingest";
import type { SynodCaseView } from "./synod-ingest";
import { synodEvidenceRoot } from "./synod-group";

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
  /** Dispute filer — a SynodCase PDA when the dispute is synod-backed. */
  filer: Uint8Array;
  evidence_hashes: Uint8Array[];
  current_round: number;
}

export interface DeliverChainReader {
  readDispute(dispute: Uint8Array): Promise<DisputeView | null>;
  readSubaccord(subaccord: Uint8Array): Promise<SubaccordView | null>;
  readRound(dispute: Uint8Array): Promise<RoundView | null>;
  /** Synod bridge: resolve the filer-addressed SynodCase, or null if not one. */
  readSynodCase(filer: Uint8Array): Promise<SynodCaseView | null>;
}

export interface DeliverStore {
  /** Fetch the round-`k` ciphertext bundle, or `null` if none is stored. */
  get(subaccord: Uint8Array, dispute: Uint8Array, round: number): Promise<EvidenceBundle | null>;
  /** v2 multifile (accord-5d0r): stored file objects — derived-completeness input. */
  listFiles(subaccord: Uint8Array, dispute: Uint8Array, round: number): Promise<FileStat[]>;
  /** v2 per-file delivery (accord-5d0r): fetch one stored document bundle. */
  getFile(
    subaccord: Uint8Array,
    dispute: Uint8Array,
    round: number,
    path: string,
  ): Promise<EvidenceBundle | null>;
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

/** One manifest entry's delivery status (accord-5d0r derived index). */
export interface DeliveredFile {
  readonly path: string;
  readonly status: "stored" | "pending" | "out_of_band";
}

/** One round's re-encrypted package + derived per-entry index. */
export interface DeliveredRound {
  round: number;
  out: Uint8Array;
  operator_ephem_pub: Uint8Array;
  /**
   * v2 multifile (accord-5d0r): per-entry delivery status, derived on read —
   * no persisted index. `[]` for manifest-only rounds (v1 shape-compat).
   */
  files: DeliveredFile[];
  /** True iff every tracked entry is stored (always true for manifest-only). */
  complete: boolean;
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

  // Synod deliver bridge (accord-g1dy): when the filer is a SynodCase PDA
  // bound to THIS dispute, the evidence source is the pre-dispute group
  // (keyed `{case.subaccord}/{case_pda}/{slot}`), not the per-round bundle —
  // `evidence_hashes[0]` is the file-time ROOT, so the generic loop below
  // could never gate it. An unbound case at the filer (or a different
  // program's PDA) falls through to the dispute-keyed path unchanged.
  const synodCase = await deps.chain.readSynodCase(dv.filer);
  if (synodCase !== null && bytesEqual(synodCase.dispute, dispute)) {
    return deliverSynodGroup(dv, synodCase, juror, operatorSk, wm, deps);
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

    // v2 derived index (accord-5d0r): manifest entries × store listing, no
    // persisted state. PUT leaf-gates every stored object, so path presence
    // implies content match — re-hashing here would re-decrypt every file.
    const entries = parseManifest(new TextDecoder().decode(plaintext)).entries;
    const storedPaths = new Set(
      (await deps.store.listFiles(dv.subaccord, dispute, k)).map((f) => f.path),
    );
    const files: DeliveredFile[] = [];
    let complete = true;
    for (const e of entries) {
      if (URL_PATH.test(e.path) || e.sha256 === SENTINEL_HEX) {
        files.push({ path: e.path, status: "out_of_band" });
        continue;
      }
      const ok = storedPaths.has(e.path);
      files.push({ path: e.path, status: ok ? "stored" : "pending" });
      if (!ok) complete = false;
    }
    delivered.push({ round: k, out, operator_ephem_pub, files, complete });
  }

  if (delivered.length === 0) {
    return { status: 404, reason: "no evidence ingested for dispute" };
  }

  return { status: 200, rounds: delivered };
}
export type DeliverFileOutcome =
  | { status: 200; out: Uint8Array; operator_ephem_pub: Uint8Array }
  | { status: 404; reason: string }
  | { status: 409; reason: string };

/**
 * Per-file delivery (accord-5d0r): `GET /evidence/{dispute}/for/{juror}/{round}/{path}`.
 * One document, one plaintext in memory. Gates: drawn juror → non-sentinel
 * round slot → stored manifest (integrity-gated like the index) → tracked
 * entry → DERIVED completeness (409 until every tracked entry is stored —
 * jurors never see half a case) → file decrypt + leaf gate → watermark →
 * re-encrypt. Synod pre-dispute groups have no per-path namespace → 404.
 */
export async function deliverFile(
  dispute: Uint8Array,
  juror: Uint8Array,
  round: number,
  path: string,
  deps: DeliverDeps,
): Promise<DeliverFileOutcome> {
  const wm = deps.watermark ?? NoOpWatermark;

  const dv = await deps.chain.readDispute(dispute);
  if (dv === null) return { status: 404, reason: "dispute not found" };

  const synodCase = await deps.chain.readSynodCase(dv.filer);
  if (synodCase !== null && bytesEqual(synodCase.dispute, dispute)) {
    return { status: 404, reason: "per-file delivery not available for synod groups" };
  }

  const sub = await deps.chain.readSubaccord(dv.subaccord);
  if (sub === null) return { status: 404, reason: "subaccord not found" };
  const operatorSk = await deps.keyring.forOperator(sub.evidence_operator);
  if (operatorSk === null) return { status: 404, reason: "unknown evidence operator" };

  const rd = await deps.chain.readRound(dispute);
  if (rd === null) return { status: 404, reason: "dispute not yet drawn" };
  if (!rd.jurors.some((j) => bytesEqual(j, juror))) {
    return { status: 404, reason: "juror not drawn for this dispute" };
  }

  const h = dv.evidence_hashes[round];
  if (h === undefined || isZero(h)) {
    return { status: 404, reason: `no evidence this round ${round}` };
  }

  const manifest = await deps.store.get(dv.subaccord, dispute, round);
  if (manifest === null) return { status: 404, reason: `no evidence ingested for round ${round}` };

  const unwrapped = await deps.crypto.unwrap(manifest, operatorSk);
  if (unwrapped === null) {
    return { status: 409, reason: `round ${round}: ciphertext undecryptable (tampered bundle)` };
  }
  if (!bytesEqual(await deps.crypto.sha256(unwrapped.plaintext), h)) {
    return {
      status: 409,
      reason: `round ${round}: integrity gate failed (sha256 != evidence_hashes[${round}])`,
    };
  }

  const entry = parseManifest(new TextDecoder().decode(unwrapped.plaintext)).entries.find(
    (e) => e.path === path && !URL_PATH.test(e.path) && e.sha256 !== SENTINEL_HEX,
  );
  if (entry === undefined) {
    return { status: 404, reason: `path not tracked in round-${round} manifest` };
  }

  // Derived completeness over the full entry set (not just this path): the
  // claimant's package is all-or-nothing for the juror.
  const entries = parseManifest(new TextDecoder().decode(unwrapped.plaintext)).entries;
  const storedPaths = new Set(
    (await deps.store.listFiles(dv.subaccord, dispute, round)).map((f) => f.path),
  );
  for (const e of entries) {
    if (URL_PATH.test(e.path) || e.sha256 === SENTINEL_HEX) continue;
    if (!storedPaths.has(e.path)) {
      return {
        status: 409,
        reason: `round ${round} incomplete: ${JSON.stringify(e.path)} not yet stored`,
      };
    }
  }

  const fileBundle = await deps.store.getFile(dv.subaccord, dispute, round, path);
  if (fileBundle === null) return { status: 404, reason: "file not stored" };
  const fileUnwrapped = await deps.crypto.unwrap(fileBundle, operatorSk);
  if (fileUnwrapped === null) {
    return { status: 409, reason: "document undecryptable (tampered bundle)" };
  }
  const leafHex = Array.from(await deps.crypto.sha256(fileUnwrapped.plaintext))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (leafHex !== entry.sha256) {
    return { status: 409, reason: `leaf gate failed: sha256(document) != manifest entry` };
  }

  const watermarked = wm.apply(fileUnwrapped.plaintext, juror);
  const { out, operator_ephem_pub } = await deps.crypto.reencryptToJuror(watermarked, juror);
  return { status: 200, out, operator_ephem_pub };
}

/**
 * Synod group delivery (accord-g1dy): one re-encrypted package per party
 * slot, `round` carrying the slot index. Gates, in order:
 *
 *  1. every slot `0..party_count-1` has a stored bundle — else `404` (the
 *     group is incomplete; nothing is assembled);
 *  2. file-time root: `H(case ‖ h_0 … h_{N-1})` recomputed from the STORED
 *     bundles' `plaintext_hash` must equal `evidence_hashes[0]` — else `409`,
 *     juror assembly refused (daemon-side bundle swap detected; the on-chain
 *     root was built from the join-committed per-party hashes);
 *  3. per-slot tamper gate: `sha256(plaintext) == bundle.plaintext_hash`.
 *
 * ponytail: appeal-round evidence (ADR-0023) is NOT mixed in here — the
 * bridge serves the round-0 group only; if a synod dispute ever carries
 * per-round appeal bundles, extend the response with the generic loop over
 * `evidence_hashes[1..=current_round]` under distinct round tags.
 */
async function deliverSynodGroup(
  dv: DisputeView,
  synodCase: SynodCaseView,
  juror: Uint8Array,
  operatorSk: Uint8Array,
  wm: Watermark,
  deps: DeliverDeps,
): Promise<DeliverOutcome> {
  const bundles: EvidenceBundle[] = [];
  for (let slot = 0; slot < synodCase.party_count; slot++) {
    const b = await deps.store.get(synodCase.subaccord, dv.filer, slot);
    if (b === null) {
      return { status: 404, reason: `no evidence ingested for party slot ${slot}` };
    }
    bundles.push(b);
  }

  const root = await synodEvidenceRoot(
    dv.filer,
    bundles.map((b) => b.plaintext_hash),
    deps.crypto.sha256,
  );
  if (!bytesEqual(root, dv.evidence_hashes[0] ?? new Uint8Array(0))) {
    return { status: 409, reason: "synod evidence root mismatch — assembly refused" };
  }

  const delivered: DeliveredRound[] = [];
  for (let slot = 0; slot < bundles.length; slot++) {
    const b = bundles[slot]!;
    const unwrapped = await deps.crypto.unwrap(b, operatorSk);
    if (unwrapped === null) {
      return {
        status: 409,
        reason: `party slot ${slot}: ciphertext undecryptable (tampered bundle)`,
      };
    }
    if (!bytesEqual(await deps.crypto.sha256(unwrapped.plaintext), b.plaintext_hash)) {
      return {
        status: 409,
        reason: `party slot ${slot}: integrity gate failed (sha256 != committed hash)`,
      };
    }
    const watermarked = wm.apply(unwrapped.plaintext, juror);
    const { out, operator_ephem_pub } = await deps.crypto.reencryptToJuror(watermarked, juror);
    delivered.push({ round: slot, out, operator_ephem_pub, files: [], complete: true });
  }
  return { status: 200, rounds: delivered };
}
