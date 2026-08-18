/**
 * Server ↔ pipeline seam (ADR-0011, milestone accord-yjno §2).
 *
 * The HTTP layer depends ONLY on these handler interfaces. The concrete
 * ingest/deliver/health handlers are injected into {@link createApp} /
 * {@link main}, so the server typechecks and tests in isolation from the
 * not-yet-implemented pipeline (beans accord-r9km / accord-4swo / accord-u1pu).
 *
 * Handlers are async, pure functions of their inputs. The server owns HTTP
 * concerns (status, Location, rate limit, TLS); handlers own domain concerns
 * (codec, integrity gate, store, chain reads, re-encryption).
 */

import type { KeyringPublicKeys } from "./public-keys.js";

/** 32-byte SHA-256 digest, hex- or base58-style opaque to the server. */
export type Hash = string;

/** A POSTed evidence bundle as parsed by the ingest handler (codec = pipeline). */
export interface EvidenceBundleInput {
  /** AES-GCM(plaintext) under the DEK — ciphertext, base64 over the wire. */
  ct: string;
  /** Claimant ephemeral X25519 pubkey, base64. */
  claimant_ephem_pub: string;
  /** AES-GCM(DEK) envelope, base64. */
  wrapped: string;
  /** sha256(plaintext) — must equal the on-chain Dispute.evidence_hashes[round]. */
  plaintext_hash: Hash;
  /** Unix ms. */
  ingested_at?: number;
}

/**
 * One round's delivered, Juror-bound re-encrypted payload (ADR-0006 delivery
 * step 4-5; ADR-0023 per-round). A GET returns one of these per non-zero
 * `evidence_hashes[k]` in the juror's round, ordered round-ascending.
 */
export interface DeliveryPayload {
  /** Evidence round (0 = filer; 1..MAX_APPEALS = appeal rounds). */
  round: number;
  /** AES-GCM(watermarked) under the operator→juror ECDH key, base64. */
  out: string;
  /** Operator ephemeral X25519 pubkey for this delivery, base64. */
  operator_ephem_pub: string;
}

/**
 * GET delivery body: the set of per-round packages a drawn juror receives
 * (ADR-0023). Round-0-only disputes return a single-element `rounds[]`.
 */
export interface DeliveryBody {
  rounds: DeliveryPayload[];
}

export type IngestResult =
  | { readonly ok: true; readonly status: 201; readonly location: string }
  | { readonly ok: false; readonly status: 400 | 404 | 409; readonly error: string };

export type DeliverResult =
  | { readonly ok: true; readonly status: 200; readonly body: DeliveryBody }
  | { readonly ok: false; readonly status: 404 | 409; readonly error: string };

export type ManifestResult =
  | { readonly ok: true; readonly status: 200; readonly body: unknown }
  | { readonly ok: false; readonly status: 404 | 409; readonly error: string };

/**
 * Manifest = GET /evidence/{subaccord}/{dispute}[/{round}]. Decrypts the stored
 * bundle in memory and returns the plaintext manifest — no auth, no
 * re-encryption. `round` defaults to 0.
 * 200+decrypted manifest, or 404 (no bundle / subaccord / unknown operator)
 * / 409 (ciphertext undecryptable — tampered bundle).
 *
 * TODO: once the manifest schema defines public vs private components, parse
 * the decrypted plaintext and publish ONLY the public parts. For now the entire
 * manifest is returned in the clear.
 */
export type ManifestHandler = (
  subaccord: string,
  dispute: string,
  round: number,
) => Promise<ManifestResult>;

/**
 * Ingest = POST /evidence/{subaccord}/{dispute}[/{round}]. Validates,
 * integrity-gates against the on-chain evidence_hashes[round], stores the
 * ciphertext bundle (idempotent on plaintext_hash). `round` defaults to 0
 * (filer); 1..MAX_APPEALS = appeal evidence (ADR-0023). Returns 201+location,
 * or 400 (bad bundle / bad round) / 409 (a different plaintext_hash already
 * exists for this dispute+round).
 */
export type IngestHandler = (
  subaccord: string,
  dispute: string,
  round: number,
  body: unknown,
) => Promise<IngestResult>;

/**
 * Deliver = GET /evidence/{dispute}/for/{juror}. Confirms the juror is drawn,
 * decrypts in memory, integrity-gates, re-encrypts to the juror X25519 key.
 * Returns 200+payload, or 404 (not drawn / not deliverable / unknown operator)
 * / 409 (integrity-gate failure — alerts).
 */
export type DeliverHandler = (dispute: string, juror: string) => Promise<DeliverResult>;

/**
 * Synod ingest = POST /evidence/synod/{case}/{party} (milestone accord-daq8).
 * Pre-dispute grouping by SynodCase PDA + party slot (0..6). Unauthenticated
 * by design — the join-committed per-party hash IS the commit; the daemon
 * gates on case existence (404), live slot (400), and dispute-not-yet-bound
 * (409). Result shape is {@link IngestResult}.
 */
export type SynodIngestHandler = (
  casePda: string,
  party: number,
  body: unknown,
) => Promise<IngestResult>;

/**
 * Synod manifest = GET /evidence/synod/{case} (accord-lry5). Assembled
 * multi-bundle manifest: every roster slot with ADR-0017 payload attribution
 * (`party` field), absent slots marked (partial pre-file view), and post-file
 * the `verified` flag from recomputing H(case ‖ h_0…h_{N-1}) vs
 * `evidence_hashes[0]`. Result shape is {@link ManifestResult}.
 */
export type SynodManifestHandler = (casePda: string) => Promise<ManifestResult>;

/**
 * Liveness/readiness = GET /healthz. ok iff Storage + RPC reachable; LB drains
 * on a non-ok result. (Bean accord-u1pu implements the real probe; the server
 * boots with a stub until then.)
 */
export type HealthProbe = () => Promise<
  { readonly ok: true } | { readonly ok: false; readonly detail: string }
>;

/** The full handler set the server needs to serve traffic. */

export interface ServerDeps {
  readonly ingest: IngestHandler;
  readonly synodIngest: SynodIngestHandler;
  readonly deliver: DeliverHandler;
  readonly manifest: ManifestHandler;
  readonly synodManifest: SynodManifestHandler;
  readonly health: HealthProbe;

  /**
   * The operator Ed25519 public keys served at GET /config (ADR-0011). Pubkeys
   * are public (== on-chain `evidence_operator`); seeds never cross this seam.
   * Built once at boot by `buildKeyringPublicKeys`.
   */
  readonly publicKeys: KeyringPublicKeys;
}
