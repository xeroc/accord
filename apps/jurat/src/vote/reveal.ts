// reveal.ts — the vote executor's reveal path (bean accord-qk0q).
//
// Reveal at window open with the EXACT persisted preimage: the chain
// recomputes `hash(vote_le ‖ salt ‖ juror)` and rejects any mismatch
// (RevealMismatch), so a lost or corrupted salt is unrecoverable — there
// is no correct reveal left to make. On salt loss we alert and throw
// `SaltLostError` (the pipeline abstains with kind `salt-lost`); a guessed
// salt is never tried, not even once.
//
// The client-side window gate mirrors instructions/reveal.rs exactly:
//   `(now >= commit_end || all_committed) && now < reveal_end`
// (unix seconds; the early-open relaxation fires when the whole panel has
// committed — see commit.rs flipping the dispute to Reveal).
//
// Mirrors commit.ts: injected IO only, DRY_RUN gates the tx, idempotent
// on the persisted record.
import type { Address, Instruction } from "@solana/kit";
import { reveal as sdkReveal, type AccordVotingClient, type VotingAccounts } from "@useaccord/sdk";

import type { VoteRecord, VoteStore } from "./commit.js";

/** One duty ready to reveal: accounts and the round's reveal window. */
export interface RevealPlan {
  /** `signer` is the operator key; must be the committed juror. */
  accounts: VotingAccounts;
  roundIdx: number;
  /** Window bounds, unix seconds — mirrors `Round.commit_end`/`reveal_end`. */
  commitEnd: number;
  revealEnd: number;
  /** `Round.commit_count === Round.juror_count` — opens reveal early. */
  allCommitted: boolean;
}

export interface RevealDeps {
  client: AccordVotingClient;
  programId: Address;
  store: VoteStore;
  /** Sign + send the built instruction; resolves to the tx signature. */
  send(ix: Instruction): Promise<string>;
  /** Notification channel — used for the dry-run notice and salt-loss alert. */
  notify(message: string): Promise<void>;
  /** Unix-seconds clock (injected for deterministic window tests). */
  now(): number;
  /** Optional logger; defaults to console.log. */
  log?(message: string): void;
}

export interface RevealResult {
  /** True iff a real tx was sent. */
  sent: boolean;
  /** True when the duty was already revealed in a prior pass (no-op). */
  alreadyRevealed: boolean;
  dryRun: boolean;
  signature?: string;
}

/** Thrown when `now` is outside the reveal window. */
export class RevealWindowClosedError extends Error {
  constructor(
    public readonly now: number,
    public readonly commitEnd: number,
    public readonly revealEnd: number,
  ) {
    super(
      `RevealWindowClosed: now ${now} outside [${commitEnd}, ${revealEnd}) ` +
        `(on-chain gate: instructions/reveal.rs)`,
    );
    this.name = "RevealWindowClosedError";
  }
}

/**
 * The persisted preimage is missing, uncommitted, or unreadable — no
 * correct reveal exists. Callers alert + abstain (kind `salt-lost`);
 * guessing is never an option: the chain hashes the preimage and any
 * wrong guess is a guaranteed RevealMismatch.
 */
export class SaltLostError extends Error {
  constructor(detail: string) {
    super(`SaltLost: ${detail} — abstaining, no reveal is possible`);
    this.name = "SaltLostError";
  }
}

/** Load and validate the persisted preimage, or throw SaltLostError (after alerting). */
async function loadPreimage(
  deps: RevealDeps,
  dispute: string,
  roundIdx: number,
): Promise<VoteRecord> {
  const fail = async (detail: string): Promise<never> => {
    await deps.notify(`[jurat] salt lost for ${dispute} round ${roundIdx}: ${detail} — abstaining`);
    throw new SaltLostError(detail);
  };

  const record = await deps.store.load(dispute, roundIdx);
  if (!record) {
    return fail("no persisted vote record");
  }
  if (!record.committed) {
    return fail("record exists but no commit tx ever landed");
  }
  const salt = Buffer.from(record.salt, "hex");
  if (salt.length !== 32) {
    return fail(`persisted salt is ${salt.length} bytes, expected 32`);
  }
  if (!/^\d+$/.test(record.vote)) {
    return fail(`persisted vote "${record.vote}" is not a decimal integer`);
  }
  return record;
}

/**
 * Reveal a committed vote. Idempotent: an already-revealed record is a
 * no-op (the chain would reject with AlreadyRevealed anyway). Salt loss
 * alerts + throws; the window gate throws. DRY_RUN builds + notifies but
 * never sends.
 */
export async function revealVote(
  deps: RevealDeps,
  plan: RevealPlan,
  dryRun: boolean,
): Promise<RevealResult> {
  const { accounts, roundIdx } = plan;

  const existing = await deps.store.load(accounts.dispute, roundIdx);
  if (existing?.revealedAt !== undefined) {
    return { sent: false, alreadyRevealed: true, dryRun };
  }

  const now = deps.now();
  if ((now < plan.commitEnd && !plan.allCommitted) || now >= plan.revealEnd) {
    throw new RevealWindowClosedError(now, plan.commitEnd, plan.revealEnd);
  }

  const record = await loadPreimage(deps, accounts.dispute, roundIdx);
  const salt = Buffer.from(record.salt, "hex");
  const vote = BigInt(record.vote);

  const instruction = sdkReveal(deps.client, deps.programId, accounts, { vote, salt });

  if (dryRun) {
    const message =
      `[jurat dry-run] reveal ${accounts.dispute} round ${roundIdx}: ` +
      `vote ${record.vote} — no tx sent`;
    (deps.log ?? console.log)(message);
    await deps.notify(message);
    return { sent: false, alreadyRevealed: false, dryRun: true };
  }

  const signature = await deps.send(instruction);
  await deps.store.save({ ...record, revealedAt: deps.now() });
  return { sent: true, alreadyRevealed: false, dryRun: false, signature };
}
