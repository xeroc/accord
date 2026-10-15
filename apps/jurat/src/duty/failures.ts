// failures.ts — the duty failure path (bean accord-5mpb): abstain & alert.
//
// Failure policy (milestone decision 8): retry ladder → clean abstain. A
// juror that cannot produce a valid verdict simply does not vote — a
// default/garbage vote would poison the Schelling signal for profit.
// Abstention in v1 is the absence of a vote (there is no on-chain abstain
// instruction), so this module has exactly two powers: mark the duty
// abstained in local state, and fire the Telegram alert. It structurally
// cannot build, sign, or send a vote — no client, no instruction, no vote
// argument exists on its surface.
//
// Not DRY_RUN-gated: neither power is a vote-shaped tx, and an abstention
// is exactly what an operator wants to hear about in either mode.
//
// Ordering invariant: the abstention mark is persisted BEFORE the alert is
// attempted — a Telegram outage must never lose the durable record (an
// unmarked abstention looks like a hung duty on restart).
import {
  type DutyFailure,
  type DutyRecord,
  type DutyRef,
  type DutyStore,
  type FailureKind,
} from "./types.js";

/**
 * Mark a duty abstained with the failure reason and fire one alert.
 *
 * - Missing duty record → synthesized as abstained (the pipeline may die
 *   before the tracker ever persisted it; ops still needs the mark).
 * - Existing record → extended in place: unknown tracker fields survive.
 * - Already `revealed` → no-op: the vote landed; a late failure is moot
 *   and must not clobber a success record.
 * - Re-abstain → newest failure wins, alert fires again.
 */
export async function abstain(
  deps: { store: DutyStore; notify(message: string): Promise<void>; now(): number },
  ref: DutyRef,
  kind: FailureKind,
  reason: string,
): Promise<DutyRecord> {
  const prior = await deps.store.load(ref.dispute, ref.roundIdx);
  if (prior?.status === "revealed") {
    return prior;
  }

  const failure: DutyFailure = { kind, reason, at: deps.now() };
  const record: DutyRecord = prior
    ? { ...prior, status: "abstained", failure, updatedAt: failure.at }
    : {
        dispute: ref.dispute,
        roundIdx: ref.roundIdx,
        status: "abstained",
        failure,
        updatedAt: failure.at,
      };
  await deps.store.save(record);

  await deps.notify(
    `[jurat] abstained ${ref.dispute} round ${ref.roundIdx}: ${kind} — ${reason}`,
  );
  return record;
}
