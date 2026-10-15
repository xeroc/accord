// types.ts — duty-domain record types shared by the duty pipeline
// (tracker, failure path, vote executor). Kept dependency-free so every
// pipeline stage can import it without pulling in behavior.
//
// The duty record is intentionally minimal: `dispute` + `roundIdx` identity,
// a coarse lifecycle status, and the terminal failure when one occurred.
// The duty tracker (accord-wryi) owns richer fields (drawnAt, seat index,
// evidence cursor, …) — it extends this record; consumers that only read
// these fields stay decoupled via the structural type.

/** Identifies one drawn seat's obligation: a dispute round we must vote in. */
export interface DutyRef {
  /** Dispute PDA, base58. */
  dispute: string;
  roundIdx: number;
}

/**
 * Duty lifecycle, vote-executor view: open → committed → revealed, with
 * `abstained` as the terminal failure exit (bean accord-5mpb).
 */
export type DutyStatus = "open" | "committed" | "revealed" | "abstained";

/** Every v1 failure source that terminates a duty in abstention. */
export const FAILURE_KINDS = [
  /** Evidence intake failed: daemon unreachable, bundle undecryptable. */
  "evidence-unavailable",
  /** Agent retry ladder exhausted: primary + fallback endpoints both failed. */
  "retry-ladder-exhausted",
  /** Agent output failed verdict-schema validation — never guess a vote from it. */
  "malformed-verdict",
  /** No valid verdict in hand before commit_end (subsumes exhausted send retries). */
  "window-closed",
  /** Reveal path found no readable persisted salt (used by reveal, accord-qk0q). */
  "salt-lost",
] as const;

export type FailureKind = (typeof FAILURE_KINDS)[number];

/** The terminal failure recorded on an abstained duty. */
export interface DutyFailure {
  kind: FailureKind;
  /** Human-readable cause — goes verbatim into the alert. */
  reason: string;
  /** Unix seconds. */
  at: number;
}

/** A tracked voting duty. Stored in the jurat state dir. */
export interface DutyRecord {
  dispute: string;
  roundIdx: number;
  status: DutyStatus;
  /** Set iff status === "abstained" (the newest failure wins on re-abstain). */
  failure?: DutyFailure;
  /** Unix seconds of the last write. */
  updatedAt: number;
}

/**
 * Narrow persistence seam over the jurat state dir (Epic 1). Keyed by
 * dispute + round index, same as the vote store.
 */
export interface DutyStore {
  load(dispute: string, roundIdx: number): Promise<DutyRecord | undefined>;
  save(record: DutyRecord): Promise<void>;
}
