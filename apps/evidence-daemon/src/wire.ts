/**
 * Composition adapters (bean accord-tzmm) — the single place the HTTP
 * `ServerDeps` handler contract meets the pure `ingest`/`deliver` pipeline AND
 * the real modules (S3Store, chain reader, EnvKeyring, ECIES crypto).
 *
 * Why this file exists: the pipeline ports are deliberately `Uint8Array` /
 * snake_case (pure, unit-testable in isolation); the real modules are
 * `Address` / camelCase (Solana Kit + S3 convention). Those two worlds do not
 * line up directly, so the impedance is collected here where it is auditable
 * in one place. Plaintext never crosses this boundary — only ciphertext bytes,
 * save for the in-memory decrypt/re-encrypt inside `deliver` (ADR-0006).
 *
 * Authority: milestone accord-yjno HANDOFF §1-§4; ADR-0006 / ADR-0011.
 */
import { address, type Address } from "@solana/kit";
import bs58 from "bs58";

import type { Accord } from "@useaccord/sdk";

import { readDispute, readRound, readSubaccord } from "./chain/reader";
import { deliverToJuror, operatorDecrypt, sha256 } from "@useaccord/sdk/evidence";
import { EnvKeyring } from "./keys/keyring";
import { deliver } from "./pipeline/deliver";
import {
  ingest,
  type EvidenceBundle,
  type IngestChainReader,
  type IngestDeps,
  type IngestStore,
} from "./pipeline/ingest";
import { NoOpWatermark } from "./pipeline/watermark";
import {
  base64ToBytes,
  bytesToBase64,
  type EvidenceStore,
  type EvidenceBundle as StoreBundle,
  serializeBundle,
} from "./store/store";
import type { DeliverHandler, IngestHandler, ManifestHandler, ServerDeps } from "./server/handlers";

// ---------------------------------------------------------------------------
// base58 / Address codec. Path params arrive as base58 strings; the pipeline
// wants raw 32 bytes, the store/reader want branded `Address`.
// ---------------------------------------------------------------------------

/** base58 Solana address string → 32 raw bytes (throws on malformed input). */
function b58ToBytes(s: string): Uint8Array {
  return bs58.decode(s);
}

/** 32 raw bytes → branded Solana `Address` (round-trips via base58). */
function bytesToAddr(b: Uint8Array): Address {
  return address(bs58.encode(b));
}

// ---------------------------------------------------------------------------
// Bundle-shape translation: pipeline EvidenceBundle (snake/bytes) ↔ store
// EvidenceBundle (camel/Address). Field-for-field, no plaintext either way.
// ---------------------------------------------------------------------------

function toStoreBundle(b: EvidenceBundle): StoreBundle {
  return {
    subaccord: bytesToAddr(b.subaccord),
    dispute: bytesToAddr(b.dispute),
    round: b.round,
    ct: b.ct,
    claimantEphemPub: b.claimant_ephem_pub,
    wrapped: b.wrapped,
    plaintextHash: b.plaintext_hash,
    ingestedAt: b.ingested_at,
  };
}

function fromStoreBundle(b: StoreBundle): EvidenceBundle {
  return {
    subaccord: b58ToBytes(b.subaccord),
    dispute: b58ToBytes(b.dispute),
    round: b.round,
    ct: b.ct,
    claimant_ephem_pub: b.claimantEphemPub,
    wrapped: b.wrapped,
    plaintext_hash: b.plaintextHash,
    ingested_at: b.ingestedAt,
  };
}

// ---------------------------------------------------------------------------
// ServerDeps factory. Inject the constructed real modules; get back the handler
// set `createApp` consumes. Pure wiring — no hidden singletons.
// ---------------------------------------------------------------------------

export interface WireDeps {
  /** Ciphertext store (v1: S3Store). Address-typed. */
  readonly store: EvidenceStore;
  /** Read-only RPC client (the chain reader functions close over this). */
  readonly accord: Accord;
  /** Per-Subaccord operator keyring (v1: EnvKeyring). */
  readonly keyring: EnvKeyring;
  /** Liveness probe wired by main.ts (S3 + RPC reachability). */
  readonly health: ServerDeps["health"];
}

export function createServerDeps(deps: WireDeps): ServerDeps {
  const { store, accord, keyring } = deps;

  // --- store adapter: pipeline ports (Uint8Array) → EvidenceStore (Address) ---
  const ingestStore: IngestStore = {
    async exists(sa, d, round) {
      return store.exists(bytesToAddr(sa), bytesToAddr(d), round);
    },
    async get(sa, d, round) {
      const b = await store.get(bytesToAddr(sa), bytesToAddr(d), round);
      return b === null ? null : fromStoreBundle(b);
    },
    async put(b) {
      await store.put(toStoreBundle(b));
    },
  };
  const deliverStore = {
    async get(sa: Uint8Array, d: Uint8Array, round: number) {
      const b = await store.get(bytesToAddr(sa), bytesToAddr(d), round);
      return b === null ? null : fromStoreBundle(b);
    },
  };

  // --- chain adapter: reader functions (Accord+Address) → pipeline ports ---
  const readDisputeIngest = async (d: Uint8Array) => {
    const v = await readDispute(accord, bytesToAddr(d));
    if (v === null) return null;
    // Copy each readonly slot into a mutable pipeline value; the full ADR-0023
    // array is passed so ingest can gate against evidence_hashes[round].
    return {
      subaccord: b58ToBytes(v.subaccord),
      evidence_hashes: v.evidenceHashes.map((h) => new Uint8Array(h)),
    };
  };
  const readDisputeDeliver = async (d: Uint8Array) => {
    const v = await readDispute(accord, bytesToAddr(d));
    if (v === null) return null;
    return {
      subaccord: b58ToBytes(v.subaccord),
      evidence_hashes: v.evidenceHashes.map((h) => new Uint8Array(h)),
      current_round: v.currentRound,
    };
  };
  const ingestChain: IngestChainReader = { readDispute: readDisputeIngest };
  const deliverChain = {
    readDispute: readDisputeDeliver,
    async readSubaccord(sa: Uint8Array) {
      const v = await readSubaccord(accord, bytesToAddr(sa));
      if (v === null) return null;
      return { evidence_operator: b58ToBytes(v.evidenceOperator) };
    },
    async readRound(d: Uint8Array) {
      const addr = bytesToAddr(d);
      const dv = await readDispute(accord, addr);
      if (dv === null) return null;
      const r = await readRound(accord, addr, dv.currentRound);
      if (r === null) return null;
      // Only the first `jurorCount` entries are live; the rest are zero-pubkey padding.
      return { jurors: r.jurors.slice(0, r.jurorCount).map((j) => b58ToBytes(j)) };
    },
  };

  // --- keyring adapter: EnvKeyring (Ed25519Keypair) → deliver secret seed ---
  const deliverKeyring = {
    async forOperator(operatorPubkey: Uint8Array) {
      const kp = await keyring.forOperator(operatorPubkey);
      return kp === null ? null : kp.secretKey;
    },
  };

  // --- crypto adapter: real async ECIES → async DeliveryCrypto port ---
  const crypto = {
    async sha256(data: Uint8Array) {
      return sha256(data);
    },
    async unwrap(bundle: EvidenceBundle, operatorSecret: Uint8Array) {
      try {
        const plaintext = await operatorDecrypt(
          {
            ct: bundle.ct,
            claimant_ephem_pub: bundle.claimant_ephem_pub,
            wrapped: bundle.wrapped,
            plaintext_hash: bundle.plaintext_hash,
          },
          operatorSecret,
        );
        return { plaintext };
      } catch {
        // Tampered/undecryptable bundle — deliver() maps null → 409.
        return null;
      }
    },
    async reencryptToJuror(watermarked: Uint8Array, jurorPubkey: Uint8Array) {
      const jb = await deliverToJuror(watermarked, jurorPubkey);
      return { out: jb.out, operator_ephem_pub: jb.operator_ephem_pub };
    },
  };

  // --- HTTP handlers: string/JSON ↔ pipeline bytes ---

  const ingestHandler: IngestHandler = async (subaccordStr, disputeStr, round, body) => {
    let sa: Uint8Array;
    let d: Uint8Array;
    try {
      sa = b58ToBytes(subaccordStr);
      d = b58ToBytes(disputeStr);
    } catch {
      return { ok: false, status: 400, error: "invalid base58 address" };
    }
    const parsed = parseIngestBody(body);
    if (parsed === null) {
      return { ok: false, status: 400, error: "malformed evidence bundle" };
    }
    // ingested_at is server-stamped inside ingest(); 0 is a placeholder here.
    const bundle: EvidenceBundle = {
      subaccord: sa,
      dispute: d,
      round,
      ct: parsed.ct,
      claimant_ephem_pub: parsed.claimant_ephem_pub,
      wrapped: parsed.wrapped,
      plaintext_hash: parsed.plaintext_hash,
      ingested_at: 0,
    };
    const out = await ingest(sa, d, round, bundle, {
      store: ingestStore,
      chain: ingestChain,
    } satisfies IngestDeps);
    if (out.status === 201) {
      return {
        ok: true,
        status: 201,
        location: `/evidence/${subaccordStr}/${disputeStr}/${round}`,
      };
    }
    return { ok: false, status: out.status, error: out.reason };
  };

  const deliverHandler: DeliverHandler = async (disputeStr, jurorStr) => {
    let d: Uint8Array;
    let j: Uint8Array;
    try {
      d = b58ToBytes(disputeStr);
      j = b58ToBytes(jurorStr);
    } catch {
      return { ok: false, status: 404, error: "invalid address" };
    }
    const out = await deliver(d, j, {
      store: deliverStore,
      chain: deliverChain,
      keyring: deliverKeyring,
      crypto,
      watermark: NoOpWatermark,
    });
    if (out.status === 200) {
      return {
        ok: true,
        status: 200,
        body: {
          rounds: out.rounds.map((r) => ({
            round: r.round,
            out: bytesToBase64(r.out),
            operator_ephem_pub: bytesToBase64(r.operator_ephem_pub),
          })),
        },
      };
    }
    return { ok: false, status: out.status, error: out.reason };
  };
  // Manifest — public read of the raw stored ciphertext bundle. No chain read,
  // no crypto, no auth. The response is ciphertext only (ADR-0006); safe to
  // expose. Returns 404 when no bundle is stored for the dispute+round.
  const manifestHandler: ManifestHandler = async (subaccordStr, disputeStr, round) => {
    let sa: Address;
    let d: Address;
    try {
      sa = bytesToAddr(b58ToBytes(subaccordStr));
      d = bytesToAddr(b58ToBytes(disputeStr));
    } catch {
      return { ok: false, status: 404, error: "invalid address" };
    }
    const bundle = await store.get(sa, d, round);
    if (bundle === null) {
      return { ok: false, status: 404, error: "evidence bundle not found" };
    }
    // Byte-identical to the stored serialized bundle — the canonical wire format.
    return { ok: true, status: 200, body: JSON.parse(serializeBundle(bundle)) };
  };

  return {
    ingest: ingestHandler,
    deliver: deliverHandler,
    manifest: manifestHandler,
    health: deps.health,
  };
}

// ---------------------------------------------------------------------------
// Body parsing: JSON (base64 string fields) → bytes. Rejects anything that is
// not an object with the four required base64 fields. No plaintext field exists.
// ---------------------------------------------------------------------------

interface ParsedBundle {
  readonly ct: Uint8Array;
  readonly claimant_ephem_pub: Uint8Array;
  readonly wrapped: Uint8Array;
  readonly plaintext_hash: Uint8Array;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseIngestBody(body: unknown): ParsedBundle | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  try {
    return {
      ct: base64ToBytes(asString(o.ct)),
      claimant_ephem_pub: base64ToBytes(asString(o.claimant_ephem_pub)),
      wrapped: base64ToBytes(asString(o.wrapped)),
      plaintext_hash: base64ToBytes(asString(o.plaintext_hash)),
    };
  } catch {
    return null;
  }
}
