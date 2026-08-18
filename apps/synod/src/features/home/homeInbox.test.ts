/**
 * homeInbox.test.ts — pure-logic tests for the home inbox (accord-hvf9).
 *
 * Milestone §6 row: "Given connected wallet ∈ parties[] with joined bit
 * clear, When home, Then case listed in 'Cases awaiting you'". Join must also
 * be actionable — only Opening cases (pre-file; join closes at file/deadline).
 *
 * Pure functions (no RPC, no React) — run via `node --import tsx --test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CaseState } from "@useaccord/synod";

import { inboxCases, rosterFill } from "./homeInbox.js";

const WALLET = "GhE5rtYAqYTBDfVbnWFFeNDWwBtBV3F3q2rGzKGtFrV8";
const OTHER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const P3 = [
  WALLET,
  OTHER,
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
];

function mk(over: Partial<Parameters<typeof inboxCases>[1][number]> = {}) {
  return {
    address: "Case11111111111111111111111111111111111111111",
    state: CaseState.Opening,
    parties: P3,
    partyCount: 3,
    joined: 0b000,
    joinDeadline: 2000n,
    stake: 1000n,
    ...over,
  };
}

test("inboxCases: wallet on roster, joined bit clear, Opening → listed", () => {
  const inbox = inboxCases(WALLET, [mk()]);
  assert.equal(inbox.length, 1);
});

test("inboxCases: wallet already joined → not listed", () => {
  const inbox = inboxCases(WALLET, [mk({ joined: 0b001 })]);
  assert.equal(inbox.length, 0);
});

test("inboxCases: wallet not on roster → not listed", () => {
  const inbox = inboxCases(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    [mk()],
  );
  assert.equal(inbox.length, 0);
});

test("inboxCases: non-Opening case → not listed (join is closed)", () => {
  assert.equal(inboxCases(WALLET, [mk({ state: CaseState.Live })]).length, 0);
  assert.equal(inboxCases(WALLET, [mk({ state: CaseState.Closed })]).length, 0);
});

test("inboxCases: no wallet → empty", () => {
  assert.equal(inboxCases(null, [mk()]).length, 0);
});

test("inboxCases: sorted by join deadline ascending (most urgent first)", () => {
  const inbox = inboxCases(WALLET, [
    mk({ address: "A…late", joinDeadline: 3000n }),
    mk({ address: "B…soon", joinDeadline: 1000n }),
    mk({ address: "C…mid", joinDeadline: 2000n }),
  ]);
  assert.deepEqual(
    inbox.map((c) => c.joinDeadline),
    [1000n, 2000n, 3000n],
  );
});

test("inboxCases: padded tail slots never match (partyCount bounds the scan)", () => {
  // parties[] is fixed-length 7 with zero-pubkey tail; partyCount 2 must not
  // read slot 2..6. Wallet placed in a padding slot via partyCount=2 roster.
  const padded = mk({
    parties: [OTHER, OTHER, WALLET, OTHER, OTHER, OTHER, OTHER],
    partyCount: 2,
  });
  assert.equal(inboxCases(WALLET, [padded]).length, 0);
});

test("rosterFill: joined/total display", () => {
  assert.equal(rosterFill({ joined: 0b011, partyCount: 3 }), "2/3");
  assert.equal(rosterFill({ joined: 0b111, partyCount: 3 }), "3/3");
  assert.equal(rosterFill({ joined: 0, partyCount: 2 }), "0/2");
});
