/**
 * Domain CAS pipeline: `PUT/GET /domains/{hash}` (ADR-0027, milestone
 * accord-lgof). Permissionless content-addressed storage for PUBLIC domain
 * documents — preimage resistance IS the authentication.
 *
 * The daemon is a dumb CAS here: hash + size checks only, never parses the
 * body, never gates on chain state (upload legally precedes create_list).
 * Retention is forever — nothing in this pipeline ever deletes.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Domain CAS namespace".
 */

import { bytesEqual } from "./ingest.js";
import {
  assertDomainHash,
  type DomainObject,
  DomainConflictError,
  type DomainStore,
} from "../store/domain.js";

/** Digest port — the real `sha256` from `@useaccord/sdk/evidence` (wire.ts). */
export type DomainHasher = (data: Uint8Array) => Promise<Uint8Array>;

export interface DomainDeps {
  readonly store: DomainStore;
  /** Body cap in bytes; enforced BEFORE the hash check and any store write. */
  readonly maxBytes: number;
  /** Injected so tests don't need the SDK digest (wire passes the real one). */
  readonly sha256: DomainHasher;
}

export type DomainPutOutcome =
  | { readonly status: 201 } // created
  | { readonly status: 200 } // idempotent no-op — equal bytes already stored
  | { readonly status: 400; readonly reason: string } // malformed hash / sha mismatch
  | { readonly status: 409; readonly reason: string } // different bytes at the hash
  | { readonly status: 413; readonly reason: string }; // over cap

export type DomainGetOutcome =
  | { readonly status: 200; readonly bytes: Uint8Array; readonly contentType: string }
  | { readonly status: 400; readonly reason: string }
  | { readonly status: 404; readonly reason: string };

/** 32 raw bytes → 64-char lowercase hex. */
function toHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}

/**
 * Validate + store a public document at `domains/{hash}`. Order is
 * load-bearing: hash shape → size cap (413 before any store write) →
 * sha256(body) == hash → idempotency/conflict against stored bytes.
 */
export async function putDomain(
  hash: string,
  bytes: Uint8Array,
  contentType: string,
  deps: DomainDeps,
): Promise<DomainPutOutcome> {
  try {
    assertDomainHash(hash);
  } catch {
    return { status: 400, reason: "hash must be 64-char lowercase hex" };
  }
  if (bytes.length > deps.maxBytes) {
    return { status: 413, reason: `domain document exceeds ${deps.maxBytes}-byte cap` };
  }
  const digest = toHex(await deps.sha256(bytes));
  if (digest !== hash) {
    return { status: 400, reason: "body sha256 does not match route hash" };
  }

  // Idempotency: equal bytes already stored ⇒ 200 no-op; different bytes at
  // the same hash ⇒ 409 collision alarm (never overwrite). The store's own
  // put() re-checks under the race window; its DomainConflictError ⇒ 409.
  const existing = await deps.store.get(hash);
  if (existing !== null) {
    return bytesEqual(existing.bytes, bytes)
      ? { status: 200 }
      : { status: 409, reason: "different bytes already stored at this hash" };
  }
  const obj: DomainObject = { hash, bytes, contentType };
  try {
    await deps.store.put(obj);
    return { status: 201 };
  } catch (e) {
    if (e instanceof DomainConflictError) {
      return { status: 409, reason: "different bytes already stored at this hash" };
    }
    throw e;
  }
}

/** Fetch the public document at `hash`, or 404. Bytes out — never parsed. */
export async function getDomain(
  hash: string,
  deps: Pick<DomainDeps, "store">,
): Promise<DomainGetOutcome> {
  try {
    assertDomainHash(hash);
  } catch {
    return { status: 400, reason: "hash must be 64-char lowercase hex" };
  }
  const obj = await deps.store.get(hash);
  if (obj === null) return { status: 404, reason: "domain document not found" };
  return { status: 200, bytes: obj.bytes, contentType: obj.contentType };
}
