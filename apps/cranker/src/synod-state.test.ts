/**
 * synod-state.test.ts — unit tests for the pure Synod case crank resolver
 * (bean accord-i1mp).
 *
 * Gates mirror programs/synod/src/instructions/{file_dispute,
 * refund_roster_miss,claim}.rs exactly: `now` is a Unix-seconds timestamp
 * matching `Clock::get().unix_timestamp`. `dispute` is the bound Accord
 * dispute's decoded data (`["dispute", case, 0]`, bound at file_dispute), or
 * `null` when the case is Opening / the dispute is unknown to the cycle.
 */
import { test, expect } from "bun:test";
import { address } from "@solana/kit";
import { CaseState, type SynodCase } from "@useaccord/synod";
import { DisputeState, NO_RULING, type Dispute } from "@useaccord/sdk";

import { resolveSynodAction } from "./synod-state.js";

const A = address("11111111111111111111111111111111");
const PARTY0 = address("11111111111111111111111111111112");
const PARTY1 = address("11111111111111111111111111111113");
const PARTY2 = address("11111111111111111111111111111114");
const N = 2; // partyCount for the default fixture
const FULL = (1 << N) - 1; // 0b11
const DEADLINE = 10_000n;

function kase(over: Partial<SynodCase> & Pick<SynodCase, "state"> = {} as never): SynodCase {
  return {
    discriminator: new Uint8Array(8),
    subaccord: A,
    parties: [PARTY0, PARTY1, A, A, A, A, A],
    partyCount: N,
    joined: FULL,
    stake: 1_000n,
    fee: 30n,
    joinDeadline: DEADLINE,
    evidence: new Array(7).fill(new Uint8Array(32)),
    dispute: A,
    paidOut: 0,
    bump: 0,
    ...over,
  };
}

function dispute(
  over: Partial<Pick<Dispute, "state" | "finalRuling">> & Pick<Dispute, "state"> = {} as never,
): Pick<Dispute, "state" | "finalRuling"> {
  return { finalRuling: NO_RULING, ...over };
}

// --- Opening → file_dispute (full roster, early lock) ------------------------

test("Opening case with full roster → file_dispute (no deadline wait)", () => {
  expect(resolveSynodAction(kase({ state: CaseState.Opening }), null, 0n)).toEqual({
    kind: "synod_file_dispute",
  });
});

test("Opening case, full roster, deadline already passed → still file_dispute (refund requires RosterIncomplete)", () => {
  expect(resolveSynodAction(kase({ state: CaseState.Opening }), null, DEADLINE + 999n)).toEqual({
    kind: "synod_file_dispute",
  });
});

// --- Opening → refund_roster_miss (deadline + incomplete roster) -------------
test("Opening case, deadline passed, unpaid slot never joined → null (refund requires a joined party)", () => {
  // joined = {2}, paidOut = {2}; slot 0/1 unpaid but never joined — the
  // on-chain handler rejects them (PartyNotJoined), so nothing to crank.
  const c = kase({ state: CaseState.Opening, partyCount: 3, joined: 0b100, paidOut: 0b100 });
  expect(resolveSynodAction(c, null, DEADLINE + 1n)).toBeNull();
});
test("Opening case, deadline passed, joined-unpaid party after a paid one → refund that party", () => {
  const c = kase({
    state: CaseState.Opening,
    partyCount: 3,
    joined: 0b101, // parties 0 + 2 joined, 1 absent
    paidOut: 0b001, // party 0 already refunded
  });
  expect(resolveSynodAction(c, null, DEADLINE + 1n)).toEqual({
    kind: "synod_refund_roster_miss",
    partyIndex: 2,
  });
});

test("Opening case, incomplete roster, inside deadline → null", () => {
  const c = kase({ state: CaseState.Opening, joined: 0b01 });
  expect(resolveSynodAction(c, null, DEADLINE - 1n)).toBeNull();
});

// --- Live → claim (dispute Final/Failed only) --------------------------------

test("Live case, dispute Final, ruling = party 1 → claim party 1 only", () => {
  const c = kase({ state: CaseState.Live });
  const d = dispute({ state: DisputeState.Final, finalRuling: 1n });
  expect(resolveSynodAction(c, d, 0n)).toEqual({ kind: "synod_claim", partyIndex: 1 });
});

test("Live case, dispute Final, winner already paid → null (one-shot payout; case should be Closed)", () => {
  const c = kase({ state: CaseState.Live, paidOut: 0b10 });
  const d = dispute({ state: DisputeState.Final, finalRuling: 1n });
  expect(resolveSynodAction(c, d, 0n)).toBeNull();
});

test("Live case, dispute Final, neutral ruling (r == party_count) → claim first unclaimed party", () => {
  const c = kase({ state: CaseState.Live });
  const d = dispute({ state: DisputeState.Final, finalRuling: BigInt(N) });
  expect(resolveSynodAction(c, d, 0n)).toEqual({ kind: "synod_claim", partyIndex: 0 });
});

test("Live case, dispute Final, neutral ruling, party 0 paid → claim party 1", () => {
  const c = kase({ state: CaseState.Live, paidOut: 0b01 });
  const d = dispute({ state: DisputeState.Final, finalRuling: BigInt(N) });
  expect(resolveSynodAction(c, d, 0n)).toEqual({ kind: "synod_claim", partyIndex: 1 });
});

test("Live case, dispute Failed → claim first unclaimed party (full S back)", () => {
  const c = kase({ state: CaseState.Live });
  const d = dispute({ state: DisputeState.Failed });
  expect(resolveSynodAction(c, d, 0n)).toEqual({ kind: "synod_claim", partyIndex: 0 });
});

test("Live case, dispute still resolving (Reveal) → null; claim would err DisputeNotFinal", () => {
  const c = kase({ state: CaseState.Live });
  expect(resolveSynodAction(c, dispute({ state: DisputeState.Reveal }), 0n)).toBeNull();
});

test("Live case, dispute unknown to the cycle → null", () => {
  expect(resolveSynodAction(kase({ state: CaseState.Live }), null, 0n)).toBeNull();
});

test("Live case, Final with NO_RULING sentinel (invariant break) → null", () => {
  const c = kase({ state: CaseState.Live });
  expect(
    resolveSynodAction(c, dispute({ state: DisputeState.Final, finalRuling: NO_RULING }), 0n),
  ).toBeNull();
});

test("Live case, Final with ruling > party_count (InvalidRuling on-chain) → null", () => {
  const c = kase({ state: CaseState.Live });
  expect(
    resolveSynodAction(c, dispute({ state: DisputeState.Final, finalRuling: BigInt(N + 1) }), 0n),
  ).toBeNull();
});

// --- Terminal / misc ---------------------------------------------------------

test("Closed case → null (terminal)", () => {
  expect(resolveSynodAction(kase({ state: CaseState.Closed }), null, 0n)).toBeNull();
});

test("7-party case: full-roster mask spans all slots → file_dispute", () => {
  const c = kase({
    state: CaseState.Opening,
    partyCount: 7,
    parties: [PARTY0, PARTY1, PARTY2, A, A, A, A],
    joined: 0b111_1111,
  });
  expect(resolveSynodAction(c, null, 0n)).toEqual({ kind: "synod_file_dispute" });
});
