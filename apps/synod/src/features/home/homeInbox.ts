/**
 * homeInbox.ts — pure inbox/browser logic for the home view (accord-hvf9).
 *
 * "Cases awaiting you": connected wallet ∈ `parties[0..party_count)` with its
 * `joined` bit clear, on an `Opening` case (join is only actionable pre-file —
 * the roster view at /cases/:address carries the join + evidence CTA).
 * Sorted by `join_deadline` ascending — the most urgent case first.
 *
 * Structural subset of kit's `Account<SynodCase>` so the page can pass the
 * scan results straight through. No React, no RPC.
 */

import { CaseState } from "@useaccord/synod";

import { bitSet, joinedCount } from "../case/caseDetail.js";

/** Minimal case shape the inbox + browser cards read. */
export interface InboxCase {
  address: string;
  state: CaseState;
  /** Fixed-length roster; slots ≥ partyCount are zero-pubkey padding. */
  parties: readonly string[];
  partyCount: number;
  joined: number;
  joinDeadline: bigint;
  stake: bigint;
}

/** Cases the wallet should join next: on-roster, unjoined, still Opening. */
export function inboxCases(
  wallet: string | null,
  cases: readonly InboxCase[],
): InboxCase[] {
  if (!wallet) return [];
  return cases
    .filter((c) => {
      if (c.state !== CaseState.Opening) return false;
      const idx = c.parties.slice(0, c.partyCount).indexOf(wallet);
      return idx >= 0 && !bitSet(c.joined, idx);
    })
    .sort((a, b) => (a.joinDeadline < b.joinDeadline ? -1 : 1));
}

/** `2/3` roster-fill display. */
export function rosterFill(c: { joined: number; partyCount: number }): string {
  return `${joinedCount(c.joined)}/${c.partyCount}`;
}
