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
  /** sha256(plaintext) — must equal the on-chain Dispute.evidence_hash. */
  plaintext_hash: Hash;
  /** Unix ms. */
  ingested_at?: number;
}

/** Delivered, Juror-bound re-encrypted payload (ADR-0006 delivery step 4-5). */
export interface DeliveryPayload {
  /** AES-GCM(watermarked) under the operator→juror ECDH key, base64. */
  out: string;
  /** Operator ephemeral X25519 pubkey for this delivery, base64. */
  operator_ephem_pub: string;
}

export type IngestResult =
  | { readonly ok: true; readonly status: 201; readonly location: string }
  | { readonly ok: false; readonly status: 400 | 409; readonly error: string };

export type DeliverResult =
  | { readonly ok: true; readonly status: 200; readonly body: DeliveryPayload }
  | { readonly ok: false; readonly status: 404 | 409; readonly error: string };

/**
 * Ingest = POST /evidence/{subaccord}/{dispute}. Validates, integrity-gates
 * against the on-chain evidence_hash, stores the ciphertext bundle (idempotent
 * on plaintext_hash). Returns 201+location, or 400 (bad bundle) / 409 (a
 * different plaintext_hash already exists for this dispute).
 */
export type IngestHandler = (
  subaccord: string,
  dispute: string,
  body: unknown,
) => Promise<IngestResult>;

/**
 * Deliver = GET /evidence/{dispute}/for/{juror}. Confirms the juror is drawn,
 * decrypts in memory, integrity-gates, re-encrypts to the juror X25519 key.
 * Returns 200+payload, or 404 (not drawn / not deliverable / unknown operator)
 * / 409 (integrity-gate failure — alerts).
 */
export type DeliverHandler = (
  dispute: string,
  juror: string,
) => Promise<DeliverResult>;

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
  readonly deliver: DeliverHandler;
  readonly health: HealthProbe;
}
