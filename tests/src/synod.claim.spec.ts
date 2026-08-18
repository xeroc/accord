// synod.claim.spec.ts — `claim` payout paths against Surfpool
// (port of programs/synod/tests/payout_litesvm.rs, claim paths).
//
// Coverage (milestone accord-oylq HANDOFF §6):
//  - claim before Final/Failed reverts (DisputeNotFinal)
//  - Final ruling = party i: the prevailing party pulls the whole pot
//    N·S − fee exactly once; replay is a no-op; non-winners pull nothing;
//    case closes on the winner payout
//  - Final ruling = neutral: each party pulls ⌊pot/N⌋; the LAST claimant
//    drains the remainder; vault ends at exactly 0
//  - Failed: each party pulls S in full (Accord's cancel_dispute returned
//    the fee to the vault — simulated by re-crediting it, as cancel is
//    Accord's own e2e coverage)
//
// Terminal dispute states are fabricated (decode → mutate → re-encode →
// surfnet_setAccount) — see synod-harness.ts forceDisputeOutcome.

import type { Address } from "@solana/kit";
import { CaseState } from "@useaccord/synod";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import { ataOf, setTokenBalance } from "./setup/tokens.js";
import {
  armSynodCourt,
  claimSynodShare,
  fileSynodDispute,
  forceDisputeOutcome,
  openFullRoster,
  readSynodCase,
  SY_STAKE,
  tokenAmount,
  type SynodArm,
  type SynodCaseFixture,
} from "./synod-harness.js";
import { synodEconomics } from "./setup/fixtures.js";

describe("e2e: synod claim (requires Surfpool)", () => {
  let env: TestEnv;
  let arm!: SynodArm;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;
    arm = await armSynodCourt(env);
  }, 180_000);

  /** Real open → join → file; dispute still Created (unresolved). */
  async function liveCase(
    partyCount: number,
  ): Promise<{ fx: SynodCaseFixture; dispute: Address }> {
    const fx = await openFullRoster(arm, partyCount);
    const dispute = await fileSynodDispute(fx);
    return { fx, dispute };
  }

  it("rejects a claim while the dispute is unresolved (DisputeNotFinal)", async () => {
    if (!env.up) return;
    const { fx, dispute } = await liveCase(2);
    await expect(claimSynodShare(fx, fx.parties[0]!, dispute)).rejects.toThrow();
  });

  it("pays the prevailing party the whole pot, once; case closes", async () => {
    if (!env.up) return;
    const { fx, dispute } = await liveCase(3);
    await forceDisputeOutcome(env, dispute, { state: "Final", ruling: 1n });

    const eco = synodEconomics({
      partyCount: 3,
      stake: SY_STAKE,
      feePerJuror: 5n,
      minJurySize: 3,
    });
    const vault = await ataOf(arm.mint, fx.casePda);
    expect(await tokenAmount(env, vault)).toBe(eco.pot);

    // A non-winner pulls first: nothing due, no state change, no paid bit.
    await claimSynodShare(fx, fx.parties[0]!, dispute);
    expect((await readSynodCase(env, fx.casePda))!.state).toBe(CaseState.Live);
    expect(await tokenAmount(env, vault)).toBe(eco.pot);

    // The winner pulls the whole pot.
    const wAta = await ataOf(arm.mint, fx.parties[1]!.address);
    const before = await tokenAmount(env, wAta);
    await claimSynodShare(fx, fx.parties[1]!, dispute);
    expect(await tokenAmount(env, wAta)).toBe(before + eco.pot);
    expect(await tokenAmount(env, vault)).toBe(0n);

    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.paidOut).toBe(0b010);
    expect(c.state).toBe(CaseState.Closed);

    // Replay: no-op regardless of closed state.
    await claimSynodShare(fx, fx.parties[1]!, dispute);
    expect(await tokenAmount(env, wAta)).toBe(before + eco.pot);
  });

  it("splits a neutral ruling: floor share each, last claimant drains the vault", async () => {
    if (!env.up) return;
    // N=2 with fee 15: pot = 2000 − 15 = 1985; ⌊1985/2⌋ = 992, last takes 993.
    const { fx, dispute } = await liveCase(2);
    await forceDisputeOutcome(env, dispute, { state: "Final", ruling: 2n }); // == party_count → neutral

    const eco = synodEconomics({
      partyCount: 2,
      stake: SY_STAKE,
      feePerJuror: 5n,
      minJurySize: 3,
    });
    expect(eco.neutralShare).toBe(992n);
    expect(eco.lastNeutralShare).toBe(993n);

    const vault = await ataOf(arm.mint, fx.casePda);
    const [aAta, bAta] = await Promise.all([
      ataOf(arm.mint, fx.parties[0]!.address),
      ataOf(arm.mint, fx.parties[1]!.address),
    ]);
    const [beforeA, beforeB] = await Promise.all([
      tokenAmount(env, aAta),
      tokenAmount(env, bAta),
    ]);

    // First claimant: floor share; case still Live (one bit missing).
    await claimSynodShare(fx, fx.parties[0]!, dispute);
    expect(await tokenAmount(env, aAta)).toBe(beforeA + eco.neutralShare);
    expect((await readSynodCase(env, fx.casePda))!.state).toBe(CaseState.Live);

    // Last claimant drains the remainder (993) — vault ends at exactly 0.
    await claimSynodShare(fx, fx.parties[1]!, dispute);
    expect(await tokenAmount(env, bAta)).toBe(beforeB + eco.lastNeutralShare);
    expect(await tokenAmount(env, vault)).toBe(0n);
    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.paidOut).toBe(0b11);
    expect(c.state).toBe(CaseState.Closed);
  });

  it("refunds every party S in full on a Failed dispute", async () => {
    if (!env.up) return;
    const { fx, dispute } = await liveCase(3);
    await forceDisputeOutcome(env, dispute, { state: "Failed" });

    // Accord's cancel_dispute has returned the fee to the vault by now —
    // simulate that leg (cancel is Accord's own e2e coverage), then each
    // party must be able to pull S in full.
    const vault = await ataOf(arm.mint, fx.casePda);
    await setTokenBalance(env, fx.casePda, arm.mint, 3n * SY_STAKE);

    for (let i = 0; i < 3; i++) {
      const ata = await ataOf(arm.mint, fx.parties[i]!.address);
      const before = await tokenAmount(env, ata);
      await claimSynodShare(fx, fx.parties[i]!, dispute);
      expect(await tokenAmount(env, ata)).toBe(before + SY_STAKE);
    }

    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.paidOut).toBe(0b111);
    expect(c.state).toBe(CaseState.Closed);
    expect(await tokenAmount(env, vault)).toBe(0n);
  });
});
