// voting.spec.ts — commit / reveal / finalize_round e2e against Surfpool,
// ADR-0012 accumulator + per-seat draw_seat flow.
//
// Drives stake(accumulator paths) → create_dispute → injectCommittedVrf
// (freezes root) → draw_seat × N → commit → reveal → finalize_round, asserting
// the commit/reveal counters and the plurality winner. Reuses the shared
// draw-harness (the same fixtures draw.spec / full-lifecycle.spec use).
//
// Window timing (per Subaccord v1 defaults): commit opens at review_end
// (draw_time + review_window), reveal at commit_end (+commit_window),
// finalizable at reveal_end (+reveal_window).
import { commit, findJurorStakePda, finalizeRound, reveal } from "@accord/sdk";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import {
  armDispute,
  armSubaccordAndJurors,
  ensurePause,
  readDisputeState,
  readRound,
  resolveDistinctPanel,
  submitDraw,
  toAddress,
  warpTo,
  type DrawFixture,
  type JurorCtx,
} from "./draw-harness.js";

/** DisputeState numeric tags (state.rs — ADR-0012: Created=0, Drawn=1, …,
 * RoundResolved=5, Final=6; SnapshotPosted removed so the tags shifted). */
const DRAWN = 1;
const ROUND_RESOLVED = 5;

describe("e2e: voting commit-reveal-finalize (requires Surfpool)", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("runs commit → reveal → finalize_round, writing the plurality winner", async () => {
    if (!env.up) return; // offline CI lane

    // --- setup: pause + subaccord + 3 staked jurors + MST ---
    const pauseState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, pauseState);
    const fx: DrawFixture = { env, up: true, ...core };

    // --- create_dispute → injectCommittedVrf (freezes root) ---
    // Random nonce ⇒ unique Dispute PDA ⇒ re-runnable on the same Surfnet.
    const disputeNonce = crypto
      .getRandomValues(new Uint8Array(8))
      .reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);
    const armed = await armDispute(fx, disputeNonce);

    // --- draw_seat × N (permissionless; caller = payer) ---
    const memberships = await resolveDistinctPanel(fx, armed);
    const roundPda = await submitDraw(fx, armed, memberships);
    expect(await readDisputeState(env, armed.dispute)).toBe(DRAWN);

    // Map each drawn membership back to its staked juror (membership order ≠
    // fx.jurors order; the panel is VRF-sorted).
    const drawnJurors: JurorCtx[] = memberships.map((m) => {
      const addr = toAddress(m.leaf.juror);
      const j = fx.jurors.find((x) => x.signer.address === addr);
      if (!j) throw new Error(`drawn juror not in staked set: ${addr}`);
      return j;
    });

    let round = await readRound(env, roundPda);
    expect(round!.jurorCount).toBe(drawnJurors.length);

    // Votes [0, 0, 1] ⇒ plurality winner is option 0.
    const votes = [0, 0, 1];
    const salts = memberships.map(() =>
      crypto.getRandomValues(new Uint8Array(32)),
    );

    // --- commit all (window opens at review_end) ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.reviewEnd);
    for (let i = 0; i < drawnJurors.length; i++) {
      const { instruction } = await commit(
        drawnJurors[i]!.accord.adapter,
        env.programId,
        {
          signer: drawnJurors[i]!.signer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
        },
        { vote: votes[i]!, salt: salts[i]! },
      );
      await env.sendIx(instruction);
    }
    let mid = await readRound(env, roundPda);
    expect(mid!.commitCount).toBe(drawnJurors.length);

    // --- reveal all (window opens at commit_end) ---
    mid = await readRound(env, roundPda);
    await warpTo(env, mid!.commitEnd);
    for (let i = 0; i < drawnJurors.length; i++) {
      await env.sendIx(
        reveal(
          drawnJurors[i]!.accord.adapter,
          env.programId,
          {
            signer: drawnJurors[i]!.signer.address,
            subaccord: fx.subaccord,
            dispute: armed.dispute,
            round: roundPda,
            stakingToken: fx.mint,
            jurorTokenAccount: drawnJurors[i]!.jurorAta,
            vault: fx.vault,
          },
          { vote: votes[i]!, salt: salts[i]! },
        ),
      );
    }
    mid = await readRound(env, roundPda);
    expect(mid!.revealCount).toBe(drawnJurors.length);

    // --- finalize_round (crank; eligible after reveal_end) ---
    mid = await readRound(env, roundPda);
    await warpTo(env, mid!.revealEnd);
    const jurorStakePdas = await Promise.all(
      drawnJurors.map((j) =>
        findJurorStakePda(
          { subaccord: fx.subaccord, juror: j.signer.address },
          { programAddress: env.programId },
        ).then(([address]) => address),
      ),
    );
    await env.sendIx(
      finalizeRound(
        env.accord.adapter,
        env.programId,
        {
          signer: env.payer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
        },
        jurorStakePdas,
      ),
    );

    const finalRound = await readRound(env, roundPda);
    expect(finalRound!.result).toBe(0); // plurality winner = option 0
    expect(await readDisputeState(env, armed.dispute)).toBe(ROUND_RESOLVED);
  }, 300_000);

  it("commit before the review window opens reverts on-chain", async () => {
    if (!env.up) return;
    const pauseState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, pauseState);
    const fx: DrawFixture = { env, up: true, ...core };
    const nonce = crypto
      .getRandomValues(new Uint8Array(8))
      .reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);
    const armed = await armDispute(fx, nonce);
    const memberships = await resolveDistinctPanel(fx, armed);
    const roundPda = await submitDraw(fx, armed, memberships);

    const seat0 = fx.jurors.find(
      (x) => x.signer.address === toAddress(memberships[0]!.leaf.juror),
    )!;
    // Do NOT warp to review_end — the on-chain commit gate must reject. `commit`
    // builds the ix (the hash is pure); the window revert fires on send.
    const { instruction } = await commit(
      seat0.accord.adapter,
      env.programId,
      {
        signer: seat0.signer.address,
        subaccord: fx.subaccord,
        dispute: armed.dispute,
        round: roundPda,
      },
      { vote: 0, salt: crypto.getRandomValues(new Uint8Array(32)) },
    );
    await expect(env.sendIx(instruction)).rejects.toThrow();
  }, 200_000);
});
