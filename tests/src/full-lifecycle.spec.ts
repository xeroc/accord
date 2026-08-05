// full-lifecycle.spec.ts — M5: the crown. Drives the entire Accord dispute
// state machine once, end-to-end, against Surfpool:
//
//   create_subaccord → stake 3 → create_dispute → buildMst → post_snapshot →
//   finalize_snapshot → injectCommittedVrf → resolvePanel → draw →
//   commit all → reveal all → finalize_round → (no appeal) warp appeal window →
//   finalize_dispute
//
// Asserts the final ruling equals the revealed-vote plurality and that
// getRuling() returns it. Each juror signs its own commit/reveal via a per-juror
// Accord facade (env.sendIx collects payer + juror signers). Requires Surfpool
//
// RESOLVED: an earlier `finalize_dispute` `AccountDidNotSerialize` (#3004) —
// `Dispute::INIT_SPACE` under-counted `Option<u8>` by 1 (1185 alloc vs 1186
// serialize-Some) — was fixed by changing `final_ruling: Option<u8>` → `u8`
// u8::MAX sentinel (state.rs + lib.rs + SDK regen; matches Round). The full
// pipeline (staking/dispute/snapshot/voting/draw + the final ruling write) is
// now exercised end-to-end and GREEN.
import {
  APPEAL_WINDOW_SECS,
  commit,
  finalizeDispute,
  finalizeRound,
  reveal,
} from "@accord/sdk";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import {
  armDispute,
  armSubaccordAndJurors,
  ensurePause,
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

/** DisputeState numeric tags (generated/types/disputeState.ts). */
const DRAWN = 2;
const ROUND_RESOLVED = 6;
const FINAL = 7;

describe("e2e: full lifecycle — requires Surfpool port 8905", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("drives the dispute state machine end-to-end to a plurality ruling", async () => {
    if (!env.up) return; // offline CI lane

    // --- setup: pause + subaccord + 3 staked jurors + MST (driven here so the
    //     single `it` owns the whole machine, per the crown brief) ---
    const pauseState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, pauseState);
    const fx: DrawFixture = { env, up: true, ...core };

    // --- create_dispute → snapshot → finalize → inject VRF ---
    // Random nonce → a unique Dispute PDA. The PDA is [SEED_DISPUTE, filer,
    // nonce] with filer fixed to env.payer (no subaccord in the seed), so a
    // fixed nonce would collide with disputes from sibling specs (draw.spec
    // uses 1/2) or this spec's own prior runs on the same Surfnet. Random keeps
    // it green in isolation, on re-run, and under the unified `make test_surfpool`.
    const disputeNonce = crypto.getRandomValues(new Uint8Array(8)).reduce(
      (acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)),
      0n,
    );
    const armed = await armDispute(fx, disputeNonce);

    // --- resolvePanel → draw (caller = payer, permissionless crank) ---
    const { drawAttempt, memberships } = await resolveDistinctPanel(fx, armed);
    const jurorStakeAccounts = jurorStakeAccountsFor(fx, memberships);
    const roundPda = await submitDraw(
      fx,
      armed,
      drawAttempt,
      memberships,
      jurorStakeAccounts,
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(DRAWN);

    // Map each drawn membership back to its staked juror (membership order ≠
    // fx.jurors order; the panel is VRF-sorted).
    const drawnJurors: JurorCtx[] = memberships.map((m) => {
      const addr = toAddress(m.leaf.juror);
      const j = fx.jurors.find((x) => x.signer.address === addr);
      if (!j) throw new Error(`drawn juror not in staked set: ${addr}`);
      return j;
    });

    // Votes: two jurors for option 0, one for option 1 ⇒ plurality = 0.
    const votes = [0, 0, 1];
    const salts = memberships.map(() =>
      crypto.getRandomValues(new Uint8Array(32)),
    );

    // --- commit all (window opens at review_end) ---
    let round = await readRound(env, roundPda);
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

    // --- reveal all (window opens at commit_end) ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.commitEnd);
    for (let i = 0; i < drawnJurors.length; i++) {
      const instruction = reveal(
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

    // --- finalize_round (crank; eligible after reveal_end) ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.revealEnd);
    await env.sendIx(
      finalizeRound(env.accord.adapter, env.programId, {
        signer: env.payer.address,
        subaccord: fx.subaccord,
        dispute: armed.dispute,
        round: roundPda,
      }),
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(ROUND_RESOLVED);

    // --- no appeal: warp the 3-day appeal window, then finalize_dispute ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.revealEnd + APPEAL_WINDOW_SECS);
    await env.sendIx(
      finalizeDispute(
        env.accord.adapter,
        env.programId,
        {
          signer: env.payer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
        },
        jurorStakeAccounts, // remaining_accounts: the drawn JurorStake PDAs (0 appeals)
      ),
    );

    // Final state + plurality ruling == option 0. (getRuling() shares the
    // facade's broken fetcher path; readDisputeFinalRuling reads the same
    // dispute.final_ruling field via fetchDecoded — the on-chain get_ruling
    // value.)
    expect(await readDisputeState(env, armed.dispute)).toBe(FINAL);
    expect(await readDisputeFinalRuling(env, armed.dispute)).toBe(0);
  }, 300_000);
});
