/**
 * claim.test.ts — end-to-end dispatch tests for the synod_claim sweep (bean
 * accord-y608).
 *
 * Drives the registered executor through a real `CrankDispatch` with a fake
 * RPC (base64-encoded synthetic accounts — same shape the generated Kit
 * fetchers parse) and a capturing `sendIx`. Asserts the sweep's eligibility
 * (winner one-shot / neutral all / Failed all), the per-party ATA gate
 * (missing destination → skipped, never blocks the others), the built
 * instruction's account set, and the not-final / not-live skips.
 */
import { test, expect } from "bun:test";
import {
  address,
  type AccountMeta,
  type Address,
  type Instruction,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  Accord,
  Aggregation,
  DisputeState,
  NO_RULING,
  ShortfallPolicy,
  getDisputeEncoder,
  getSubaccordEncoder,
  type Dispute,
  type Subaccord,
} from "@useaccord/sdk";
import {
  CaseState,
  findCasePda,
  findCaseVaultPda,
  getSynodCaseEncoder,
  type SynodCase,
} from "@useaccord/synod";

import { createCrankDispatch, type CrankContext } from "../../dispatch.js";
import { ataOf } from "../../util.js";
import { execute, register } from "./claim.js";

const Z32 = new Uint8Array(32);
const Z64 = new Uint8Array(64);
const A = address("11111111111111111111111111111111");
const OPENER = address("11111111111111111111111111111112");
const PARTY1 = address("11111111111111111111111111111113");
const MINT = address("Mint111111111111111111111111111111111111111");
const SUBACCORD = address("Subac11111111111111111111111111111111111111");
const DISPUTE = address("Dispute111111111111111111111111111111111111");
const CALLER = address("c8fpTXm3XTRgE5maYQ24Li4L65wMYvAFomzXknxVEx7");

const CASE_PDA = await findCasePda({ opener: OPENER, nonce: 0n }).then(([p]) => p);
const VAULT = await findCaseVaultPda(MINT, CASE_PDA);
const ATAS = await Promise.all([ataOf(MINT, OPENER), ataOf(MINT, PARTY1)]);
const OPENER_ATA = ATAS[0]!;
const PARTY1_ATA = ATAS[1]!;

function caseArgs(over: Partial<SynodCase> = {}): SynodCase {
  return {
    discriminator: new Uint8Array(8),
    subaccord: SUBACCORD,
    parties: [OPENER, PARTY1, A, A, A, A, A],
    partyCount: 2,
    joined: 0b11,
    stake: 1_000n,
    fee: 30n,
    joinDeadline: 0n,
    evidence: new Array(7).fill(Z32),
    dispute: DISPUTE,
    paidOut: 0,
    state: CaseState.Live,
    bump: 255,
    ...over,
  } as SynodCase;
}

function disputeArgs(over: Partial<Dispute> = {}): Dispute {
  return {
    discriminator: new Uint8Array(8),
    subaccord: SUBACCORD,
    filer: CASE_PDA,
    nonce: 0n,
    numOptions: 3,
    options: new Array(8).fill(Z32),
    evidenceHashes: new Array(4).fill(Z32),
    currentRound: 0,
    terms: {
      alphaBps: 1_000,
      minStake: 1_000n,
      feePerJuror: 10n,
      reviewWindow: 0n,
      commitWindow: 0n,
      revealWindow: 0n,
      appealWindow: 100n,
      maxAppeals: 3,
      minJurySize: 3,
      aggregation: Aggregation.Plurality,
      revealThresholdBps: 6_666,
      shortfallPolicy: ShortfallPolicy.Redraw,
      maxDrawAttempts: 3,
      coherenceTolBps: 0,
    },
    finalRuling: NO_RULING,
    finalizedAt: 0n,
    feePaid: 0n,
    committedVrf: { __option: "None" },
    frozenRoot: Z32,
    frozenTotalStake: 0n,
    filedAt: 0n,
    bump: 255,
    padding: Z64,
    ...over,
  } as Dispute;
}

function subaccordArgs(): Subaccord {
  return {
    discriminator: new Uint8Array(8),
    creator: A,
    stakingToken: MINT,
    feeToken: MINT,
    minStake: 1_000n,
    alphaBps: 1_000,
    reviewWindow: 0n,
    commitWindow: 0n,
    revealWindow: 0n,
    appealWindow: 100n,
    maxAppeals: 3,
    minJurySize: 3,
    aggregation: Aggregation.Plurality,
    feePerJuror: 10n,
    revealThresholdBps: 6_666,
    shortfallPolicy: ShortfallPolicy.Redraw,
    maxDrawAttempts: 3,
    coherenceTolBps: 0,
    authority: A,
    evidenceOperator: A,
    domainRef: Z32,
    evidenceSpec: Z32,
    jurorCredential: A,
    jurorSchema: A,
    stakerCount: 0,
    rootHash: Z32,
    totalStake: 0n,
    nextIndex: 0,
    depth: 16,
    feeVaultDeposited: 0n,
    feeVaultWithdrawn: 0n,
    stakeVaultDeposited: 0n,
    stakeVaultWithdrawn: 0n,
    freeHead: 4294967295,
    bump: 255,
    padding: Z64,
  } as Subaccord;
}

/** Minimal `getAccountInfo`-only RPC over synthetic accounts. */
function fakeRpc(accounts: Map<Address, ReadonlyUint8Array | null>) {
  return {
    getAccountInfo: (a: Address) => ({
      send: async () => {
        const data = accounts.get(a);
        if (data == null) return { value: null };
        return {
          value: {
            lamports: 1n,
            data: [btoa(String.fromCharCode(...data)), "base64"],
            owner: A,
            rentEpoch: 0n,
            executable: false,
            space: BigInt(data.length),
          },
        };
      },
    }),
  };
}

interface Harness {
  ctx: CrankContext;
  sent: Instruction[];
  skips: string[];
}

function harness(kase: SynodCase, dispute: Dispute, existingAtas: Address[]): Harness {
  const accounts = new Map<Address, ReadonlyUint8Array | null>();
  accounts.set(CASE_PDA, getSynodCaseEncoder().encode(caseArgs(kase) as never));
  accounts.set(DISPUTE, getDisputeEncoder().encode(disputeArgs(dispute) as never));
  accounts.set(SUBACCORD, getSubaccordEncoder().encode(subaccordArgs() as never));
  // ATAs only need to EXIST for the gate (any bytes).
  for (const a of existingAtas) accounts.set(a, new Uint8Array([1]));
  const sent: Instruction[] = [];
  const skips: string[] = [];
  const ctx = {
    accord: {} as never,
    programId: Accord.PROGRAM_ID,
    cranker: CALLER,
    oracleQueue: DISPUTE,
    programIdentity: DISPUTE,
    signer: { address: CALLER },
    sendIx: async (ix: Instruction) => {
      sent.push(ix);
      return `sig-${sent.length}`;
    },
    log: (_kind: string, _subject: Address | null, detail: string) => skips.push(detail),
    rpc: fakeRpc(accounts),
    rpcSubscriptions: {} as never,
  } as unknown as CrankContext;
  return { ctx, sent, skips };
}

function metas(ix: Instruction): Address[] {
  return (ix.accounts as AccountMeta[]).map((m) => m.address);
}

test("Final + ruling = party 1 → dispatch fires one claim for the winner only", async () => {
  const { ctx, sent, skips } = harness(
    caseArgs(),
    disputeArgs({ state: DisputeState.Final, finalRuling: 1n }),
    [OPENER_ATA, PARTY1_ATA], // both ATAs exist; only slot 1 may claim
  );
  const d = createCrankDispatch();
  register(d);
  const handled = await d.execute(ctx, { kind: "synod_claim", case: CASE_PDA, partyIndex: 0 });
  expect(handled).toBe(true);
  expect(sent.length).toBe(1);
  const m = metas(sent[0]!);
  expect(m).toContain(CASE_PDA);
  expect(m).toContain(DISPUTE);
  expect(m).toContain(VAULT);
  expect(m).toContain(PARTY1_ATA);
  expect(m).not.toContain(OPENER_ATA);
  expect(skips.join(" | ")).not.toContain("ATA missing");
});

test("Final neutral ruling → every unclaimed party claims, in slot order", async () => {
  const { ctx, sent } = harness(
    caseArgs(),
    disputeArgs({ state: DisputeState.Final, finalRuling: 2n }), // == partyCount
    [OPENER_ATA, PARTY1_ATA],
  );
  await execute(ctx, { kind: "synod_claim", case: CASE_PDA, partyIndex: 0 });
  expect(sent.length).toBe(2);
  expect(metas(sent[0]!)).toContain(OPENER_ATA);
  expect(metas(sent[1]!)).toContain(PARTY1_ATA);
});

test("Failed + missing party ATA → that party skipped, the other still paid", async () => {
  const { ctx, sent, skips } = harness(
    caseArgs(),
    disputeArgs({ state: DisputeState.Failed }),
    [PARTY1_ATA], // opener's ATA absent
  );
  await execute(ctx, { kind: "synod_claim", case: CASE_PDA, partyIndex: 0 });
  expect(sent.length).toBe(1);
  expect(metas(sent[0]!)).toContain(PARTY1_ATA);
  expect(skips.some((s) => s.includes("party 0"))).toBe(true);
});

test("Final with winner already paid → skipped, no tx", async () => {
  const { ctx, sent } = harness(
    caseArgs({ paidOut: 0b10 }),
    disputeArgs({ state: DisputeState.Final, finalRuling: 1n }),
    [OPENER_ATA, PARTY1_ATA],
  );
  const res = await execute(ctx, { kind: "synod_claim", case: CASE_PDA, partyIndex: 1 });
  expect(res).toHaveProperty("skipped");
  expect(sent.length).toBe(0);
});

test("dispute still resolving → skipped (claim would err DisputeNotFinal)", async () => {
  const { ctx, sent } = harness(caseArgs(), disputeArgs({ state: DisputeState.Reveal }), [
    OPENER_ATA,
    PARTY1_ATA,
  ]);
  const res = await execute(ctx, { kind: "synod_claim", case: CASE_PDA, partyIndex: 0 });
  expect(res).toHaveProperty("skipped");
  expect(sent.length).toBe(0);
});

test("case not Live → skipped", async () => {
  const { ctx, sent } = harness(
    caseArgs({ state: CaseState.Closed }),
    disputeArgs({ state: DisputeState.Final, finalRuling: 1n }),
    [OPENER_ATA, PARTY1_ATA],
  );
  const res = await execute(ctx, { kind: "synod_claim", case: CASE_PDA, partyIndex: 0 });
  expect(res).toHaveProperty("skipped");
  expect(sent.length).toBe(0);
});
