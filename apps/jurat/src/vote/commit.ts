// commit.ts — the vote executor's commit path (bean accord-0ytn).
//
// Commit ASAP once a valid verdict exists: generate a 32-byte salt, persist
// it to local state BEFORE any transaction (a crash between send and save
// would orphan the salt and make reveal — and the juror's fee — impossible),
// build the `commit` instruction via the SDK facade, and send it unless
// DRY_RUN is on, in which case we log + notify instead of touching chain.
//
// The client-side window gate mirrors instructions/commit.rs exactly:
//   `review_end <= now < commit_end`  (unix seconds, Clock timestamp)
// The chain re-checks; this gate exists so we never build/sign a tx that is
// doomed to fail with CommitWindowClosed.
//
// All infrastructure (SDK client seam, tx sender, persistence, notifier,
// clock) is injected — no IO of its own, fully unit-testable.
import { randomBytes } from "node:crypto";
import type { Address, Instruction } from "@solana/kit";
import {
  assertValidVote,
  commit as sdkCommit,
  type AccordVotingClient,
  type VotingAccounts,
} from "@useaccord/sdk";

/** Commit salt length in bytes (must match the on-chain `[u8; 32]`). */
export const SALT_BYTES = 32;

/**
 * Persisted vote preimage for one duty — the reveal path's (bean accord-qk0q)
 * source of truth. JSON-safe: salt/commitment as hex, vote as decimal string.
 */
export interface VoteRecord {
  /** Dispute PDA, base58. */
  dispute: string;
  roundIdx: number;
  /** 32-byte salt, hex. Secret until reveal. */
  salt: string;
  /** The committed vote, decimal string. */
  vote: string;
  /** sha256(vote_le ‖ salt ‖ juror), hex — bookkeeping only. */
  commitment: string;
  /** True only after a REAL commit tx landed; dry runs never flip this. */
  committed: boolean;
  /** True if the last pass ran under DRY_RUN (logged + notified, no tx). */
  dryRun: boolean;
  /** Unix seconds of the reveal tx landing (reveal path, accord-qk0q). */
  revealedAt?: number;
  /** Unix seconds of the last write. */
  updatedAt: number;
}

/**
 * Narrow persistence seam over the jurat state dir (Epic 1). Keyed by
 * dispute + round index — a redraw/appeal round gets a fresh record.
 */
export interface VoteStore {
  load(dispute: string, roundIdx: number): Promise<VoteRecord | undefined>;
  save(record: VoteRecord): Promise<void>;
}

/** One duty ready to vote: accounts, the verdict, and the round's window. */
export interface CommitPlan {
  /** `signer` is the operator key; the chain checks it against Round.jurors. */
  accounts: VotingAccounts;
  roundIdx: number;
  /** Option index (Plurality only in v1 — join gates exclude Median pools). */
  vote: bigint;
  /** Dispute.num_options, for the client-side Plurality range check. */
  numOptions: number;
  /** Commit window bounds, unix seconds — mirrors `Round.review_end`/`commit_end`. */
  reviewEnd: number;
  commitEnd: number;
}

/** Injected infrastructure. `send` is never called under DRY_RUN. */
export interface CommitDeps {
  client: AccordVotingClient;
  programId: Address;
  store: VoteStore;
  /** Sign + send the built instruction; resolves to the tx signature. */
  send(ix: Instruction): Promise<string>;
  /** Notification channel (Telegram in v1); used for the dry-run notice. */
  notify(message: string): Promise<void>;
  /** Unix-seconds clock (injected for deterministic window tests). */
  now(): number;
  /** Optional logger; defaults to console.log. */
  log?(message: string): void;
}

export interface CommitResult {
  /** True iff a real tx was sent. */
  sent: boolean;
  /** True when the duty was already committed in a prior pass (no-op). */
  alreadyCommitted: boolean;
  dryRun: boolean;
  /** Commitment hex (also persisted in the VoteRecord). */
  commitment: string;
  signature?: string;
}

/** Thrown when `now` is outside `[reviewEnd, commitEnd)`. */
export class CommitWindowClosedError extends Error {
  constructor(
    public readonly now: number,
    public readonly reviewEnd: number,
    public readonly commitEnd: number,
  ) {
    super(
      `CommitWindowClosed: now ${now} outside [${reviewEnd}, ${commitEnd}) ` +
        `(on-chain gate: instructions/commit.rs)`,
    );
    this.name = "CommitWindowClosedError";
  }
}

/**
 * Commit a vote for one duty. Idempotent: an already-committed record is a
 * no-op (the chain would reject with CommitAlreadyExists anyway). Retries
 * after a failed send reuse the persisted salt so the commitment is stable.
 */
export async function commitVote(
  deps: CommitDeps,
  plan: CommitPlan,
  dryRun: boolean,
): Promise<CommitResult> {
  const { accounts, roundIdx } = plan;

  const prior = await deps.store.load(accounts.dispute, roundIdx);
  if (prior?.committed) {
    return {
      sent: false,
      alreadyCommitted: true,
      dryRun,
      commitment: prior.commitment,
    };
  }

  const now = deps.now();
  if (now < plan.reviewEnd || now >= plan.commitEnd) {
    throw new CommitWindowClosedError(now, plan.reviewEnd, plan.commitEnd);
  }

  // Plurality range check before any persistence (join gates are
  // Plurality-only in v1; the chain re-validates on reveal).
  assertValidVote(plan.vote, plan.numOptions);

  // Reuse the persisted salt on retries (stable commitment across attempts);
  // fresh 32 random bytes on first sight. A malformed persisted salt fails
  // loudly inside the SDK facade (InvalidSalt) — never guessed around.
  const salt = prior ? Buffer.from(prior.salt, "hex") : randomBytes(SALT_BYTES);

  const { instruction, commitment } = await sdkCommit(deps.client, deps.programId, accounts, {
    vote: plan.vote,
    salt,
  });
  const commitmentHex = Buffer.from(commitment).toString("hex");

  // Persist BEFORE sending: if the tx lands but the process dies before the
  // save below, the salt+vote are still on disk and reveal can proceed.
  const record: VoteRecord = {
    dispute: accounts.dispute,
    roundIdx,
    salt: Buffer.from(salt).toString("hex"),
    vote: plan.vote.toString(10),
    commitment: commitmentHex,
    committed: false,
    dryRun,
    updatedAt: now,
  };
  await deps.store.save(record);

  if (dryRun) {
    const message =
      `[jurat dry-run] commit ${accounts.dispute} round ${roundIdx}: ` +
      `vote ${plan.vote}, commitment ${commitmentHex} — no tx sent`;
    (deps.log ?? console.log)(message);
    await deps.notify(message);
    return { sent: false, alreadyCommitted: false, dryRun: true, commitment: commitmentHex };
  }

  const signature = await deps.send(instruction);
  await deps.store.save({ ...record, committed: true, dryRun: false, updatedAt: deps.now() });
  return { sent: true, alreadyCommitted: false, dryRun: false, commitment: commitmentHex, signature };
}
