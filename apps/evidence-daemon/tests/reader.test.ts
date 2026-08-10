// reader.test.ts — chain/reader.ts under a stubbed RPC.
//
// Runs under Bun (the daemon is a Bun app per SPEC.md); Bun resolves the
// extensionless internal imports of @useaccord/sdk natively, which lets these
// tests load the real reader + SDK fetchers. The SDK fetchers delegate to
// `accord.client.accord.accounts.<acct>.fetchMaybe`, so a minimal stub on
// that path yields controlled account data without a validator.
//
// Covers the bean contract: drawn/not-drawn, state gates (premature fetch is
// NOT deliverable), and operator resolution (readSubaccord returns the
// evidence_operator the keyring would resolve). The reader is the source of
// truth; these are its behavioural guarantees.
import { test, expect } from "bun:test";
import { address, type Address } from "@solana/kit";
import { DisputeState } from "@useaccord/sdk";
import {
  isDeliverable,
  isDrawn,
  readDispute,
  readRound,
  readSubaccord,
  type DisputeView,
  type RoundView,
} from "../src/chain/reader.ts";
import { stubAccord } from "./helpers/accordStub.ts";

// Distinct on-chain addresses used as fixtures.
const SYS: Address = address("11111111111111111111111111111112");
const TOK: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const RENT: Address = address("SysvarRent111111111111111111111111111111111");
const OPERATOR: Address = address("Accord1111111111111111111111111111111111111");
const ZERO_PUBKEY: Address = address("11111111111111111111111111111111");

// ---------------------------------------------------------------------------
// isDrawn — authoritative drawn-set membership (HANDOFF §4).
// ---------------------------------------------------------------------------

test("isDrawn: a juror within the first jurorCount matches", () => {
  const round: RoundView = {
    roundIdx: 0,
    jurorCount: 2,
    jurors: [SYS, TOK, ...Array.from({ length: 29 }, () => ZERO_PUBKEY)],
  };
  expect(isDrawn(round, SYS)).toBe(true);
  expect(isDrawn(round, TOK)).toBe(true);
});

test("isDrawn: a juror NOT in the drawn set fails", () => {
  const round: RoundView = {
    roundIdx: 0,
    jurorCount: 2,
    jurors: [SYS, TOK, ...Array.from({ length: 29 }, () => ZERO_PUBKEY)],
  };
  expect(isDrawn(round, RENT)).toBe(false);
});

test("isDrawn: entries at index >= jurorCount are padding, never a match", () => {
  // A real address placed in the padding tail must not be honoured — the
  // fixed-31 array's tail is zero-pubkey padding; only [0, jurorCount) is live.
  const round: RoundView = {
    roundIdx: 0,
    jurorCount: 1,
    jurors: [SYS, RENT, ...Array.from({ length: 29 }, () => ZERO_PUBKEY)],
  };
  expect(isDrawn(round, SYS)).toBe(true);
  expect(isDrawn(round, RENT)).toBe(false); // sits at index 1, but jurorCount=1
});

test("isDrawn: zero-pubkey padding never matches a real juror", () => {
  const round: RoundView = {
    roundIdx: 0,
    jurorCount: 0,
    jurors: Array.from({ length: 31 }, () => ZERO_PUBKEY),
  };
  expect(isDrawn(round, SYS)).toBe(false);
});

// ---------------------------------------------------------------------------
// isDeliverable — the state gate. Premature fetch (state < Drawn) is not
// deliverable; the daemon 404s a GET before draw (HANDOFF §6 test matrix).
// ---------------------------------------------------------------------------

test("isDeliverable: false before draw (premature fetch)", () => {
  for (const premature of [DisputeState.Created, DisputeState.SnapshotPosted]) {
    const d: DisputeView = {
      subaccord: SYS,
      evidenceHashes: [new Uint8Array(32)],
      state: premature,
      currentRound: 0,
    };
    expect(isDeliverable(d)).toBe(false);
  }
});

test("isDeliverable: true once state reaches Drawn", () => {
  const d: DisputeView = {
    subaccord: SYS,
    evidenceHashes: [new Uint8Array(32)],
    state: DisputeState.Drawn,
    currentRound: 0,
  };
  expect(isDeliverable(d)).toBe(true);
});

test("isDeliverable: true for every state at or beyond Drawn", () => {
  for (const ok of [
    DisputeState.Review,
    DisputeState.Commit,
    DisputeState.Reveal,
    DisputeState.RoundResolved,
    DisputeState.Final,
    DisputeState.Closed,
  ]) {
    const d: DisputeView = {
      subaccord: SYS,
      evidenceHashes: [new Uint8Array(32)],
      state: ok,
      currentRound: 0,
    };
    expect(isDeliverable(d)).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// readSubaccord — operator resolution. The returned `evidenceOperator` is the
// on-chain key the daemon's Keyring must resolve; unknown operator → 404.
// ---------------------------------------------------------------------------

test("readSubaccord: maps the evidence_operator the keyring resolves", async () => {
  const spec = new Uint8Array(32);
  const accord = await stubAccord({
    subaccord: { address: SYS, data: { evidenceOperator: OPERATOR, evidenceSpec: spec } },
  });
  const view = await readSubaccord(accord, SYS);
  expect(view).not.toBeNull();
  expect(view!.evidenceOperator).toBe(OPERATOR);
  expect(view!.evidenceSpec).toEqual(spec);
});

test("readSubaccord: null when the account does not exist", async () => {
  const accord = await stubAccord({});
  expect(await readSubaccord(accord, SYS)).toBeNull();
});

// ---------------------------------------------------------------------------
// readDispute — locates the parent Subaccord + the integrity-gate hash + the
// delivery state. Drives both key lookup and the state gate in the pipeline.
// ---------------------------------------------------------------------------

test("readDispute: maps subaccord / evidenceHashes / state / currentRound", async () => {
  const hashes = [
    new Uint8Array(32).fill(0xab),
    new Uint8Array(32).fill(0xcd),
    new Uint8Array(32),
    new Uint8Array(32),
  ];
  const accord = await stubAccord({
    dispute: {
      address: SYS,
      data: {
        subaccord: TOK,
        evidenceHashes: hashes,
        state: DisputeState.Drawn,
        currentRound: 3,
      },
    },
  });
  const view = await readDispute(accord, SYS);
  expect(view).not.toBeNull();
  expect(view!.subaccord).toBe(TOK);
  expect(view!.evidenceHashes).toEqual(hashes);
  expect(view!.state).toBe(DisputeState.Drawn);
  expect(view!.currentRound).toBe(3);
});

test("readDispute: null when the account does not exist", async () => {
  const accord = await stubAccord({});
  expect(await readDispute(accord, SYS)).toBeNull();
});

// ---------------------------------------------------------------------------
// readRound — derives the real ["round", dispute, u32_le(roundIdx)] PDA via the
// SDK (findRoundPda) and returns the authoritative drawn set.
// ---------------------------------------------------------------------------

test("readRound: maps the authoritative drawn set + jurorCount", async () => {
  const jurors = Array.from({ length: 31 }, () => ZERO_PUBKEY);
  jurors[0] = SYS;
  jurors[1] = TOK;
  const accord = await stubAccord({
    round: { dispute: SYS, roundIdx: 0, data: { roundIdx: 0, jurorCount: 2, jurors } },
  });
  const view = await readRound(accord, SYS, 0);
  expect(view).not.toBeNull();
  expect(view!.roundIdx).toBe(0);
  expect(view!.jurorCount).toBe(2);
  expect(view!.jurors).toEqual(jurors);
  // The drawn set is authoritative: isDrawn composes with this view.
  expect(isDrawn(view!, SYS)).toBe(true);
  expect(isDrawn(view!, RENT)).toBe(false);
});

test("readRound: null when the round is not initialized (pre-draw)", async () => {
  const accord = await stubAccord({});
  expect(await readRound(accord, SYS, 0)).toBeNull();
});

// ---------------------------------------------------------------------------
// Pipeline composition — the daemon's GET handler composes both views:
//   isDeliverable(dispute) && isDrawn(round, juror)
// This is the exact gate from HANDOFF §4.
// ---------------------------------------------------------------------------

test("composition: deliverable requires BOTH state gate AND drawn membership", () => {
  const dispute: DisputeView = {
    subaccord: SYS,
    evidenceHashes: [new Uint8Array(32)],
    state: DisputeState.Drawn,
    currentRound: 0,
  };
  const drawn: RoundView = {
    roundIdx: 0,
    jurorCount: 1,
    jurors: [SYS, ...Array.from({ length: 30 }, () => ZERO_PUBKEY)],
  };
  // Happy path: drawn juror + deliverable state.
  expect(isDeliverable(dispute) && isDrawn(drawn, SYS)).toBe(true);
  // Non-drawn juror fails the gate even when deliverable.
  expect(isDeliverable(dispute) && isDrawn(drawn, RENT)).toBe(false);
  // Premature state fails the gate even for a drawn juror.
  const premature: DisputeView = {
    ...dispute,
    state: DisputeState.SnapshotPosted,
  };
  expect(isDeliverable(premature) && isDrawn(drawn, SYS)).toBe(false);
});
