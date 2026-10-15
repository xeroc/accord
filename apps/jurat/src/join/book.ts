/**
 * book.ts — the joined-Subaccord book in Jurat's local state dir.
 *
 * One JSON file per daemon (`{stateDir}/joined-subaccords.json`) listing every
 * Subaccord Jurat staked into, the amount, and the landing signature. This is
 * the budget-accounting unit for joins (milestone accord-g69g, decision 3):
 * the global stake budget / per-subaccord caps are evaluated against the sum
 * of book entries. On-chain JurorStake accounts remain the source of truth —
 * the executor reconciles the book against them on every join (idempotent
 * re-run after a crash between send and book-write).
 *
 * ponytail: book sum is join-time amounts; it does not track slash deltas —
 * after settlement the on-chain stake can be lower. Conservative direction
 * (over-counts at-risk capital), upgrade to on-chain aggregation if budgets
 * ever bind on post-slash truth.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Address } from "@solana/kit";

/** One joined Subaccord. `staked` is the amount Jurat sent at join time. */
export interface JoinedSubaccord {
  readonly subaccord: Address;
  readonly stakingToken: Address;
  readonly staked: bigint;
  /** Landing signature of the stake transaction. */
  readonly signature: string;
  /** ISO timestamp of the join. */
  readonly joinedAt: string;
}

export interface JoinedBook {
  readonly entries: readonly JoinedSubaccord[];
}

const FILE = "joined-subaccords.json";

/** Load the book; a missing file reads as the empty book. */
export async function loadBook(stateDir: string): Promise<JoinedBook> {
  let raw: string;
  try {
    raw = await readFile(join(stateDir, FILE), "utf8");
  } catch (e) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: [] };
    }
    throw e;
  }
  const parsed = JSON.parse(raw) as {
    entries?: Array<{
      subaccord: string;
      stakingToken: string;
      staked: string;
      signature: string;
      joinedAt: string;
    }>;
  };
  return {
    entries: (parsed.entries ?? []).map((e) => ({
      subaccord: e.subaccord as Address,
      stakingToken: e.stakingToken as Address,
      staked: BigInt(e.staked),
      signature: e.signature,
      joinedAt: e.joinedAt,
    })),
  };
}

/**
 * Persist the book atomically (tmp file + rename) so a crash mid-write can
 * never corrupt the budget record.
 */
export async function saveBook(stateDir: string, book: JoinedBook): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  const file = join(stateDir, FILE);
  const tmp = `${file}.tmp`;
  const body = JSON.stringify(
    {
      entries: book.entries.map((e) => ({
        subaccord: e.subaccord,
        stakingToken: e.stakingToken,
        staked: e.staked.toString(),
        signature: e.signature,
        joinedAt: e.joinedAt,
      })),
    },
    null,
    2,
  );
  await writeFile(tmp, body, "utf8");
  await rename(tmp, file);
}

/** Total staked across all joined Subaccords (the budget-consumed number). */
export function totalStaked(book: JoinedBook): bigint {
  return book.entries.reduce((sum, e) => sum + e.staked, 0n);
}

/** Insert or replace the entry for `subaccord` (idempotent upsert). */
export function upsertEntry(book: JoinedBook, entry: JoinedSubaccord): JoinedBook {
  return {
    entries: [...book.entries.filter((e) => e.subaccord !== entry.subaccord), entry],
  };
}

/** The book entry for `subaccord`, if any. */
export function findEntry(book: JoinedBook, subaccord: Address): JoinedSubaccord | undefined {
  return book.entries.find((e) => e.subaccord === subaccord);
}
