/**
 * Domain CAS pipeline: `PUT/GET /domains/{hash}` (ADR-0027 as amended, beans
 * accord-lgof / accord-lbst). Content-addressed storage for PUBLIC domain
 * documents — preimage resistance IS the authentication.
 *
 * PUT is chain-anchored (create-first): the `?subaccord=` anchor must already
 * exist on-chain with `domain_ref == hash` before anything is stored. The
 * anchor read polls for up to {@link DEFAULT_ANCHOR_POLL_MS} to absorb
 * commitment lag right after the create-tx confirms. The daemon still never
 * parses the body, and retention is forever — nothing here ever deletes.
 * GET stays ungated.
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

/**
 * Anchor reader port — resolves the anchor Subaccord's on-chain `domain_ref`
 * (32 raw bytes), or `null` when the account does not exist (yet). Production
 * impl (wire.ts) reads via `fetchSubaccordMaybe`; tests inject fakes.
 */
export type DomainAnchorReader = (subaccord: string) => Promise<Uint8Array | null>;

/** Anchor poll budget for commitment lag after the create-tx confirms. */
export const DEFAULT_ANCHOR_POLL_MS = 1000;
/** Delay between anchor polls within the budget. */
const ANCHOR_POLL_INTERVAL_MS = 100;

export interface DomainDeps {
  readonly store: DomainStore;
  /** Body cap in bytes; enforced BEFORE the hash check and any store write. */
  readonly maxBytes: number;
  /** Injected so tests don't need the SDK digest (wire passes the real one). */
  readonly sha256: DomainHasher;
  /** Chain gate: resolves the anchor Subaccord's `domain_ref`. */
  readonly readAnchor: DomainAnchorReader;
  /** Anchor poll budget override (tests shrink it; default 1000 ms). */
  readonly anchorPollMs?: number;
}

export type DomainPutOutcome =
  | { readonly status: 201 } // created
  | { readonly status: 200 } // idempotent no-op — equal bytes already stored
  | { readonly status: 400; readonly reason: string } // malformed hash / sha mismatch / anchor mismatch
  | { readonly status: 404; readonly reason: string } // anchor Subaccord not found
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
 * Resolve the anchor's `domain_ref`, polling within the budget to absorb
 * commitment lag (the create-tx may confirm on the writer's view moments
 * before our RPC serves the account). `null` once the budget is spent.
 */
async function resolveAnchorRef(subaccord: string, deps: DomainDeps): Promise<Uint8Array | null> {
  const deadline = Date.now() + (deps.anchorPollMs ?? DEFAULT_ANCHOR_POLL_MS);
  for (;;) {
    const ref = await deps.readAnchor(subaccord);
    if (ref !== null) return ref;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await new Promise<void>((r) => setTimeout(r, Math.min(ANCHOR_POLL_INTERVAL_MS, remaining)));
  }
}

/**
 * Validate + store a public document at `domains/{hash}`. Order is
 * load-bearing: hash shape → size cap (413 before any store write) →
 * sha256(body) == hash → idempotency/conflict against stored bytes →
 * anchor gate (chain read only on the store path) → write.
 */
export async function putDomain(
  hash: string,
  bytes: Uint8Array,
  contentType: string,
  subaccord: string,
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

  // Chain gate (create-first): the anchor Subaccord must exist on-chain with
  // domain_ref == hash before the daemon stores anything. Local checks above
  // stay cheap-first; the chain read only runs on the actual store path.
  const anchorRef = await resolveAnchorRef(subaccord, deps);
  if (anchorRef === null) {
    return { status: 404, reason: "anchor subaccord not found" };
  }
  if (toHex(anchorRef) !== hash) {
    return { status: 400, reason: "anchor subaccord domain_ref does not match route hash" };
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
