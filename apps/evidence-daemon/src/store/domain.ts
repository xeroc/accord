/**
 * DomainStore trait + DomainObject data model — the public document CAS
 * (ADR-0027). Mirrors {@link ./store.ts EvidenceStore}: a pluggable,
 * content-addressed store, but for PUBLIC plaintext bytes, not ciphertext.
 *
 * The unit of storage is opaque bytes keyed by their sha256 (`hash`,
 * 64-char lowercase hex — canon's definition of `CanonList.rules_hash` /
 * `Subaccord.domain_ref`). The store is a dumb CAS: no parsing, no format
 * mandate, no chain reads. sha256(bytes) == hash and the size cap are
 * enforced at the HTTP layer; the store trusts its caller for both.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Domain CAS namespace".
 */

/** Content-Type stored/echoed when a PUT omits one. Applied at the HTTP layer. */
export const DEFAULT_DOMAIN_CONTENT_TYPE = "text/markdown";

/** 64-char lowercase hex — the shape of a sha256 digest and of every key. */
const DOMAIN_HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Reject a malformed hash before it reaches a filesystem path or an object
 * key. Internal seam, but the guard is load-bearing for the fs backend
 * (path traversal) and keeps the trait invariant cheap to rely on.
 */
export function assertDomainHash(hash: string): void {
  if (!DOMAIN_HASH_RE.test(hash)) {
    throw new Error(`DomainStore: hash must be 64-char lowercase hex, got: ${hash}`);
  }
}

/**
 * A public domain document. PLAINTEXT BY DESIGN (ADR-0027): readership is
 * "everyone", so encryption would be posture, not access control. This is
 * deliberately a different namespace from evidence — the never-plaintext
 * invariant of {@link ./store.ts EvidenceBundle} applies to evidence only.
 */
export interface DomainObject {
  /** sha256(bytes) as 64-char lowercase hex — the storage key `domains/{hash}`. */
  readonly hash: string;
  /** Opaque public bytes. Format-blind: markdown, frontmatter, or anything. */
  readonly bytes: Uint8Array;
  /** Stored alongside the bytes and echoed on GET; never sniffed or parsed. */
  readonly contentType: string;
}

/**
 * Raised by {@link DomainStore.put} when different bytes already exist at the
 * hash. A sha256 collision alarm — maps to HTTP 409; never overwrite, never
 * silently accept. Equal bytes are a no-op (idempotent) and do not raise.
 */
export class DomainConflictError extends Error {
  readonly hash: string;

  constructor(hash: string) {
    super(`domain conflict for domains/${hash}: different bytes are already stored at this hash`);
    this.name = "DomainConflictError";
    this.hash = hash;
  }
}

/**
 * Pluggable public-byte store. v1 implementations: {@link ./domain-s3.ts
 * S3DomainStore} and {@link ./domain-fs.ts FsDomainStore}, sharing the
 * evidence deployment's client/bucket (S3) or rootDir (fs) under the
 * `domains/` key prefix.
 *
 * Invariants every implementation MUST uphold:
 *  - Bytes in, bytes out — never parse, transform, or sniff the body or the
 *    content-type.
 *  - `put` is idempotent on `bytes`: re-PUT of equal bytes ⇒ no-op (first
 *    content-type wins); re-PUT of different bytes ⇒ {@link DomainConflictError}.
 *  - Retention is forever — there is NO delete. Takedown is an ops-level
 *    storage action outside the protocol, and retention sweeps must never
 *    touch the `domains/` prefix.
 */
export interface DomainStore {
  /**
   * Store the object at `domains/{hash}`. Idempotent on `bytes`:
   *  - equal bytes already stored ⇒ no-op (success);
   *  - different bytes already stored ⇒ throws {@link DomainConflictError};
   *  - no object ⇒ creates it.
   */
  put(o: DomainObject): Promise<void>;
  /** Returns the object at `hash`, or `null` if none exists. */
  get(hash: string): Promise<DomainObject | null>;
  /** `true` iff an object exists at `hash`. */
  exists(hash: string): Promise<boolean>;
}
