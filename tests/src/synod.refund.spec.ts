// synod.refund.spec.ts — `refund_roster_miss` against Surfpool
// (port of programs/synod/tests/payout_litesvm.rs, refund path).
//
// Coverage (milestone accord-oylq HANDOFF §6):
//  - after join_deadline with an incomplete roster: each JOINED party pulls S
//    back; second call is a no-op; case closes when every joined bit is paid
//  - gates: before the deadline (JoinDeadlineNotReached), a non-joined party
//    (PartyNotJoined), a full roster (RosterComplete)

import { CaseState } from "@useaccord/synod";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import { ataOf } from "./setup/tokens.js";
import { warpForwardSeconds } from "./setup/cheats.js";
import {
  armSynodCourt,
  fileSynodDispute,
  openFullRoster,
  openSynodCase,
  readSynodCase,
  refundSynodParty,
  joinSynodParty,
  SY_JOIN_WINDOW_SECS,
  SY_STAKE,
  tokenAmount,
  type SynodArm,
} from "./synod-harness.js";

describe("e2e: synod refund_roster_miss (requires Surfpool)", () => {
  let env: TestEnv;
  let arm!: SynodArm;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;
    arm = await armSynodCourt(env);
  }, 180_000);

  it("refunds each joined party S after the deadline, idempotently, then closes", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 3);
    await joinSynodParty(fx, fx.parties[0]!);
    await joinSynodParty(fx, fx.parties[2]!); // non-contiguous bits: 0b101
    const vault = await ataOf(arm.mint, fx.casePda);

    await warpForwardSeconds(env, SY_JOIN_WINDOW_SECS + 60n);

    const p0Ata = await ataOf(arm.mint, fx.parties[0]!.address);
    const p2Ata = await ataOf(arm.mint, fx.parties[2]!.address);
    const before0 = await tokenAmount(env, p0Ata); // 2·S seed − S staked = S
    const before2 = await tokenAmount(env, p2Ata);

    await refundSynodParty(fx, fx.parties[0]!);
    expect(await tokenAmount(env, p0Ata)).toBe(before0 + SY_STAKE);
    // Still Opening — party 2 hasn't pulled yet.
    expect((await readSynodCase(env, fx.casePda))!.state).toBe(
      CaseState.Opening,
    );

    await refundSynodParty(fx, fx.parties[2]!);
    expect(await tokenAmount(env, p2Ata)).toBe(before2 + SY_STAKE);
    // All joined bits paid → Closed, vault drained.
    const c = (await readSynodCase(env, fx.casePda))!;
    expect(c.paidOut).toBe(0b101);
    expect(c.state).toBe(CaseState.Closed);
    expect(await tokenAmount(env, vault)).toBe(0n);

    // Idempotent replay: paid party re-pulls — no transfer, no state change.
    await refundSynodParty(fx, fx.parties[0]!);
    expect(await tokenAmount(env, p0Ata)).toBe(before0 + SY_STAKE);
    expect((await readSynodCase(env, fx.casePda))!.state).toBe(
      CaseState.Closed,
    );
  });

  it("rejects a refund before the deadline (JoinDeadlineNotReached)", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 2);
    await joinSynodParty(fx, fx.parties[0]!);
    await expect(refundSynodParty(fx, fx.parties[0]!)).rejects.toThrow();
  });

  it("rejects a refund to a party that never joined (PartyNotJoined)", async () => {
    if (!env.up) return;
    const fx = await openSynodCase(arm, 2);
    await joinSynodParty(fx, fx.parties[0]!);
    await warpForwardSeconds(env, SY_JOIN_WINDOW_SECS + 60n);
    await expect(refundSynodParty(fx, fx.parties[1]!)).rejects.toThrow();
  });

  it("rejects a refund on a full roster (RosterComplete)", async () => {
    if (!env.up) return;
    // Full roster can file — refunding it would strand the dispute path.
    const fx = await openFullRoster(arm, 2);
    await warpForwardSeconds(env, SY_JOIN_WINDOW_SECS + 60n);
    await expect(refundSynodParty(fx, fx.parties[0]!)).rejects.toThrow();

    // Sanity: the full-roster case still files cleanly after the warp
    // (early lock — no deadline wait once full).
    await fileSynodDispute(fx);
  });
});
