// synod.open-join.spec.ts — `open_case` + `join` against Surfpool
// (port of programs/synod/tests/open_case_litesvm.rs + join_litesvm.rs).
//
// Coverage (milestone accord-oylq HANDOFF §6):
//  - happy open: SynodCase PDA inits in Opening, roster/naming frozen, fee
//    FROZEN at open (min_jury_size · fee_per_juror), dispute sentinel
//  - gates: 8 parties, duplicate parties, opener ≠ parties[0], Median
//    aggregation, N·S ≤ fee, join_deadline ≤ now
//  - happy join: S locks party ATA → case vault, evidence slot frozen,
//    joined bit set
//  - join gates: non-named wallet, double join, join after the deadline

import { Aggregation, createSubaccord } from "@useaccord/sdk";
import { CaseState, join, openCase } from "@useaccord/synod";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { ataOf, setTokenBalance } from "./setup/tokens.js";
import { DEFAULT_PUBKEY, defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import { readClock, warpForwardSeconds } from "./setup/cheats.js";
import {
  armSynodCourt,
  joinSynodParty,
  openSynodCase,
  readSynodCase,
  SY_FEE_PER_JUROR,
  SY_STAKE,
  tokenAmount,
  type SynodArm,
} from "./synod-harness.js";

describe("e2e: synod open/join (requires Surfpool)", () => {
  let env: TestEnv;
  let arm!: SynodArm;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;
    arm = await armSynodCourt(env);
  }, 180_000);

  it("opens a 3-party case, freezing roster + fee in Opening", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 3);
    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.subaccord).toBe(arm.subaccord);
    expect(c.partyCount).toBe(3);
    expect(c.parties.slice(0, 3)).toEqual(fx.parties.map((p) => p.address));
    // Unused tail slots carry Pubkey::default().
    expect(c.parties.slice(3).every((p) => p === DEFAULT_PUBKEY)).toBe(true);
    expect(c.joined).toBe(0);
    expect(c.stake).toBe(SY_STAKE);
    // Fee frozen at open: min_jury_size · fee_per_juror (never re-read).
    expect(c.fee).toBe(arm.frozenFee);
    expect(c.state).toBe(CaseState.Opening);
    // Dispute sentinel until file_dispute binds it.
    expect(c.dispute).toBe(DEFAULT_PUBKEY);
    expect(c.bump).toBeGreaterThan(0);
  });

  it("rejects 8 parties (InvalidPartyCount)", async () => {
    if (!env.up) return;
    const eight = await Promise.all(
      Array.from({ length: 8 }, () => fundSigner(env)),
    );
    await expect(
      openSynodCase(arm, 8, { parties: eight }),
    ).rejects.toThrow();
  });

  it("rejects duplicate parties (DuplicateParty)", async () => {
    if (!env.up) return;
    const [a, b] = await Promise.all([fundSigner(env), fundSigner(env)]);
    await expect(
      openSynodCase(arm, 2, { parties: [a, b, a] }),
    ).rejects.toThrow();
  });

  it("rejects opener ≠ parties[0] (OpenerNotFirstParty)", async () => {
    if (!env.up) return;
    // Open with parties[0]=a but sign with b: call the facade directly so the
    // signer is the non-first party.
    const [a, b] = await Promise.all([fundSigner(env), fundSigner(env)]);
    const now = (await readClock(env)).unixTimestamp;
    const { instruction } = await openCase(
      { opener: b, subaccord: arm.subaccord },
      {
        parties: [a.address, b.address],
        stake: SY_STAKE,
        joinDeadline: now + 3_600n,
        nonce: BigInt(Date.now()),
      },
    );
    await expect(env.sendIx(instruction)).rejects.toThrow();
  });

  it("rejects a Median subaccord (AggregationNotPlurality)", async () => {
    if (!env.up) return;
    const args = defaultSubaccordArgs(arm.mint, arm.mint, env.payer.address, {
      feePerJuror: SY_FEE_PER_JUROR,
      aggregation: Aggregation.Median,
    });
    const sub = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    await env.sendIx(sub.instruction);

    const [a, b] = await Promise.all([fundSigner(env), fundSigner(env)]);
    const now = (await readClock(env)).unixTimestamp;
    const { instruction } = await openCase(
      { opener: a, subaccord: sub.subaccord },
      {
        parties: [a.address, b.address],
        stake: SY_STAKE,
        joinDeadline: now + 3_600n,
        nonce: BigInt(Date.now()),
      },
    );
    await expect(env.sendIx(instruction)).rejects.toThrow();
  });

  it("rejects N·S ≤ fee (PotNotPositive)", async () => {
    if (!env.up) return;
    // fee = 15; 3 · 5 = 15 is not > 15.
    await expect(
      openSynodCase(arm, 3, { stake: 5n }),
    ).rejects.toThrow();
  });

  it("rejects join_deadline ≤ now (JoinDeadlinePassed)", async () => {
    if (!env.up) return;
    const now = (await readClock(env)).unixTimestamp;
    const parties = await Promise.all([fundSigner(env), fundSigner(env)]);
    const { instruction } = await openCase(
      { opener: parties[0]!, subaccord: arm.subaccord },
      {
        parties: parties.map((p) => p.address),
        stake: SY_STAKE,
        joinDeadline: now, // not strictly in the future
        nonce: BigInt(Date.now()),
      },
    );
    await expect(env.sendIx(instruction)).rejects.toThrow();
  });

  it("joins a named party: locks S, freezes the evidence slot, sets the bit", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 2);
    const evidence = randomBytes32();
    await joinSynodParty(fx, fx.parties[0]!, evidence);

    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.joined).toBe(0b01);
    expect(Buffer.from(c.evidence[0]!).toString("hex")).toBe(
      Buffer.from(evidence).toString("hex"),
    );
    // Slot 1 untouched until that party joins.
    expect(c.evidence[1]!.every((b) => b === 0)).toBe(true);

    const vault = await ataOf(arm.mint, fx.casePda);
    expect(await tokenAmount(env, vault)).toBe(SY_STAKE);
  });

  it("rejects a join from a non-named wallet (NotNamedParty)", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 2);
    const stranger = await fundSigner(env);
    await setTokenBalance(env, stranger.address, arm.mint, SY_STAKE * 2n);
    await expect(
      env.sendIx(
        await join(
          {
            party: stranger,
            case: fx.casePda,
            subaccord: arm.subaccord,
            feeMint: arm.mint,
            partyTokenAccount: await ataOf(arm.mint, stranger.address),
            vault: await ataOf(arm.mint, fx.casePda),
          },
          { evidenceHash: randomBytes32() },
        ),
      ),
    ).rejects.toThrow();
  });

  it("rejects a double join (AlreadyJoined)", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 2);
    await joinSynodParty(fx, fx.parties[0]!);
    await expect(
      joinSynodParty(fx, fx.parties[0]!),
    ).rejects.toThrow();
  });

  it("rejects a join after the deadline (JoinDeadlinePassed)", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 2);
    await warpForwardSeconds(env, 3_700);
    await expect(joinSynodParty(fx, fx.parties[1]!)).rejects.toThrow();
  });
});
