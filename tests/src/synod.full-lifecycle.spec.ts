// synod.full-lifecycle.spec.ts — the whole Synod arc against Surfpool, REAL
// Accord dispute resolution (no fabricated dispute states):
//   open → join ×N → file_dispute (CPI) → injectCommittedVrf → draw_seat ×3
//   → commit ×3 → reveal ×3 → finalize_round → finalize_dispute → claim
//
// Cases (accord-ipja):
//  - 2-party happy path: unanimous party-1 vote → prevailing party pulls the
//    whole pot through `claim`
//  - 7-party max roster + NEUTRAL ruling: every juror votes the neutral
//    option (index 7); all 7 parties claim — floor shares, last claimant
//    drains the vault (exercises accord-n3vw option space: 8 options)
//  - Failed path: pre-draw `cancel_dispute` (real accord instruction, 3-day
//    warp) returns the fee to the case vault → every party pulls S in full
//
// Reuses draw-harness for the panel/draw plumbing and synod-harness for the
// case lifecycle; claim assertions match `synodEconomics` (claim.rs mirror).

import type { Address } from "@solana/kit";
import {
  cancelDispute,
  commit,
  finalizeDispute,
  finalizeRound,
  reveal,
  DEFAULT_APPEAL_WINDOW_SECS,
} from "@useaccord/sdk";
import {
  injectCommittedVrf,
} from "./setup/vrf.js";
import {
  addressBytes,
  COMMITTED_VRF,
  jurorStakeAccountsFor,
  readDisputeFinalRuling,
  readDisputeState,
  readRound,
  resolveDistinctPanel,
  submitDraw,
  toAddress,
  warpTo,
  type DrawFixture,
  type JurorCtx,
} from "./draw-harness.js";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import { ataOf } from "./setup/tokens.js";
import { synodEconomics } from "./setup/fixtures.js";
import { warpForwardSeconds } from "./setup/cheats.js";
import {
  armSynodCourt,
  claimSynodShare,
  fileSynodDispute,
  joinSynodParty,
  openSynodCase,
  readSynodCase,
  SY_FEE_PER_JUROR,
  SY_STAKE,
  tokenAmount,
  type SynodArm,
  type SynodCaseFixture,
} from "./synod-harness.js";
import { CaseState } from "@useaccord/synod";

const ROUND_RESOLVED = 5;
const FINAL = 6;

describe("e2e: synod full lifecycle (requires Surfpool)", () => {
  let env: TestEnv;
  let arm!: SynodArm;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;
    arm = await armSynodCourt(env);
  }, 240_000);

  /** DrawFixture view over the armed court (draw-harness plumbing). */
  function drawFixture(): DrawFixture {
    return {
      env,
      up: true,
      mint: arm.mint,
      vault: arm.feeVault,
      subaccord: arm.subaccord,
      accordState: arm.accordState,
      jurors: arm.jurors,
      tree: arm.tree,
      jurorPdaByHex: arm.jurorPdaByHex,
    };
  }

  /** Drive the REAL accord chain to `Final` with a unanimous `vote`. */
  async function resolveUnanimous(dispute: Address, vote: bigint): Promise<void> {
    const fx = drawFixture();
    await injectCommittedVrf(env, dispute, COMMITTED_VRF, arm.tree.rootHash, arm.tree.totalStake);
    const armed = { dispute, disputeBytes: addressBytes(dispute) };
    const memberships = await resolveDistinctPanel(fx, armed);
    const jurorStakeAccounts = jurorStakeAccountsFor(fx, memberships);
    const roundPda = await submitDraw(fx, armed, memberships);

    const drawnJurors: JurorCtx[] = memberships.map((m) =>
      fx.jurors.find((x) => x.signer.address === toAddress(m.leaf.juror))!,
    );
    const salts = memberships.map(() => crypto.getRandomValues(new Uint8Array(32)));

    let round = await readRound(env, roundPda);
    await warpTo(env, round!.reviewEnd);
    for (let i = 0; i < drawnJurors.length; i++) {
      const { instruction } = await commit(
        drawnJurors[i]!.accord.adapter,
        env.programId,
        {
          signer: drawnJurors[i]!.signer.address,
          subaccord: arm.subaccord,
          dispute,
          round: roundPda,
        },
        { vote, salt: salts[i]! },
      );
      await env.sendIx(instruction);
    }

    round = await readRound(env, roundPda);
    await warpTo(env, round!.commitEnd);
    for (let i = 0; i < drawnJurors.length; i++) {
      const instruction = reveal(
        drawnJurors[i]!.accord.adapter,
        env.programId,
        {
          signer: drawnJurors[i]!.signer.address,
          subaccord: arm.subaccord,
          dispute,
          round: roundPda,
          stakingToken: arm.mint,
          jurorTokenAccount: drawnJurors[i]!.jurorAta,
          vault: arm.feeVault,
        },
        { vote, salt: salts[i]! },
      );
      await env.sendIx(instruction);
    }

    round = await readRound(env, roundPda);
    await warpTo(env, round!.revealEnd);
    await env.sendIx(
      finalizeRound(
        env.accord.adapter,
        env.programId,
        { signer: env.payer.address, subaccord: arm.subaccord, dispute, round: roundPda },
        jurorStakeAccounts,
      ),
    );
    expect(await readDisputeState(env, dispute)).toBe(ROUND_RESOLVED);

    round = await readRound(env, roundPda);
    await warpTo(env, round!.revealEnd + DEFAULT_APPEAL_WINDOW_SECS);
    await env.sendIx(
      finalizeDispute(
        env.accord.adapter,
        env.programId,
        { signer: env.payer.address, subaccord: arm.subaccord, dispute, round: roundPda },
        jurorStakeAccounts,
      ),
    );
    expect(await readDisputeState(env, dispute)).toBe(FINAL);
  }

  /** open + join all + file; returns the fixture + bound dispute. */
  async function liveCase(partyCount: number): Promise<{ fx: SynodCaseFixture; dispute: Address }> {
    const fx = await openSynodCase(arm, partyCount);
    for (const p of fx.parties) await joinSynodParty(fx, p);
    const dispute = await fileSynodDispute(fx);
    return { fx, dispute };
  }

  it("2-party happy path: unanimous ruling pays the prevailing party the pot", async () => {
    if (!env.up) return;
    const { fx, dispute } = await liveCase(2);
    const eco = synodEconomics({
      partyCount: 2,
      stake: SY_STAKE,
      feePerJuror: SY_FEE_PER_JUROR,
      minJurySize: 3,
    });

    // Every juror votes party 1 (option index 1).
    await resolveUnanimous(dispute, 1n);
    expect(await readDisputeFinalRuling(env, dispute)).toBe(1n);

    const vault = await ataOf(arm.mint, fx.casePda);
    expect(await tokenAmount(env, vault)).toBe(eco.pot);

    const winnerAta = await ataOf(arm.mint, fx.parties[1]!.address);
    const before = await tokenAmount(env, winnerAta);
    await claimSynodShare(fx, fx.parties[1]!, dispute);
    expect(await tokenAmount(env, winnerAta)).toBe(before + eco.pot);
    expect(await tokenAmount(env, vault)).toBe(0n);

    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.paidOut).toBe(0b10);
    expect(c.state).toBe(CaseState.Closed);
  });

  it("7-party max roster + neutral ruling: floor shares, last claimant drains", async () => {
    if (!env.up) return;
    const { fx, dispute } = await liveCase(7);
    const eco = synodEconomics({
      partyCount: 7,
      stake: SY_STAKE,
      feePerJuror: SY_FEE_PER_JUROR,
      minJurySize: 3,
    });

    // Neutral = option index 7 (highest; the 8-option space exercises n3vw).
    await resolveUnanimous(dispute, 7n);
    expect(await readDisputeFinalRuling(env, dispute)).toBe(7n);

    const vault = await ataOf(arm.mint, fx.casePda);
    const before: bigint[] = [];
    for (const p of fx.parties) {
      before.push(await tokenAmount(env, await ataOf(arm.mint, p.address)));
    }

    // First six claim the floor share; the last drains the remainder.
    for (let i = 0; i < 6; i++) {
      await claimSynodShare(fx, fx.parties[i]!, dispute);
      expect(await tokenAmount(env, await ataOf(arm.mint, fx.parties[i]!.address))).toBe(
        before[i]! + eco.neutralShare,
      );
    }
    await claimSynodShare(fx, fx.parties[6]!, dispute);
    expect(await tokenAmount(env, await ataOf(arm.mint, fx.parties[6]!.address))).toBe(
      before[6]! + eco.lastNeutralShare,
    );

    expect(await tokenAmount(env, vault)).toBe(0n);
    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.paidOut).toBe(0b111_1111);
    expect(c.state).toBe(CaseState.Closed);
  });

  it("Failed path: pre-draw cancel_dispute returns the fee; every party pulls S", async () => {
    if (!env.up) return;
    const { fx, dispute } = await liveCase(2);

    // Dispute still Created (never drawn) — cancel after the 3-day timeout.
    expect(await readDisputeState(env, dispute)).toBe(0);
    await warpForwardSeconds(env, BigInt(3 * 24 * 60 * 60 + 10));
    await env.sendIx(
      cancelDispute(
        env.accord.adapter,
        env.programId,
        {
          caller: env.payer.address,
          subaccord: arm.subaccord,
          dispute,
          feeToken: arm.mint,
          filerTokenAccount: await ataOf(arm.mint, fx.casePda), // the case vault
          feeVault: arm.feeVault,
        },
        [],
      ),
    );

    // Cancel returned the fee to the case vault → full S refundable per party.
    const vault = await ataOf(arm.mint, fx.casePda);
    expect(await tokenAmount(env, vault)).toBe(2n * SY_STAKE);

    const before0 = await tokenAmount(env, await ataOf(arm.mint, fx.parties[0]!.address));
    await claimSynodShare(fx, fx.parties[0]!, dispute);
    expect(await tokenAmount(env, await ataOf(arm.mint, fx.parties[0]!.address))).toBe(
      before0 + SY_STAKE,
    );
    const before1 = await tokenAmount(env, await ataOf(arm.mint, fx.parties[1]!.address));
    await claimSynodShare(fx, fx.parties[1]!, dispute);
    expect(await tokenAmount(env, await ataOf(arm.mint, fx.parties[1]!.address))).toBe(
      before1 + SY_STAKE,
    );

    expect(await tokenAmount(env, vault)).toBe(0n);
    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.paidOut).toBe(0b11);
    expect(c.state).toBe(CaseState.Closed);
  });


});
