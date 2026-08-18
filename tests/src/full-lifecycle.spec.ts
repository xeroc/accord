// full-lifecycle.spec.ts — the crown. Drives the entire Accord dispute state
// machine once, end-to-end, against Surfpool:
//
//   create_subaccord → stake 3 (accumulator paths) → create_dispute →
//   injectCommittedVrf (freezes root) → resolveSeat × 3 → draw_seat × 3 →
//   commit all → reveal all → finalize_round → (no appeal) warp appeal window →
//   finalize_dispute
//
// Asserts the final ruling equals the revealed-vote plurality. Each juror signs
// its own commit/reveal via a per-juror Accord facade.
import {
  DEFAULT_APPEAL_WINDOW_SECS,
  commit,
  finalizeDispute,
  finalizeRound,
  reveal,
} from "@useaccord/sdk";

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

/** DisputeState numeric tags (state.rs — ADR-0012 dropped SnapshotPosted, so
 * the tags shifted: Created=0, Drawn=1, Review=2, Commit=3, Reveal=4,
 * RoundResolved=5, Final=6, Closed=7, Failed=8). */
const DRAWN = 1;
const ROUND_RESOLVED = 5;
const FINAL = 6;

describe("e2e: full lifecycle — requires Surfpool port 8905", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("drives the dispute state machine end-to-end to a plurality ruling", async () => {
    if (!env.up) return; // offline CI lane

    // --- setup: pause + subaccord + 3 staked jurors + MST (driven here so the
    //     single `it` owns the whole machine, per the crown brief) ---
    const accordState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, accordState);
    const fx: DrawFixture = { env, up: true, ...core };

    // --- create_dispute → snapshot → finalize → inject VRF ---
    // Random nonce → a unique Dispute PDA. The PDA is [SEED_DISPUTE, filer,
    // nonce] with filer fixed to env.payer (no subaccord in the seed), so a
    // fixed nonce would collide with disputes from sibling specs (draw.spec
    // uses 1/2) or this spec's own prior runs on the same Surfnet. Random keeps
    // it green in isolation, on re-run, and under the unified `make test_surfpool`.
    const disputeNonce = crypto
      .getRandomValues(new Uint8Array(8))
      .reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);
    const armed = await armDispute(fx, disputeNonce);

    // --- resolveDistinctPanel → draw_seat × N (caller = payer, permissionless) ---
    const memberships = await resolveDistinctPanel(fx, armed);
    const jurorStakeAccounts = jurorStakeAccountsFor(fx, memberships);
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

    // Votes: two jurors for option 0, one for option 1 ⇒ plurality = 0.
    const votes = [0n, 0n, 1n];
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
          stakingToken: fx.mint,
          jurorTokenAccount: drawnJurors[i]!.jurorAta,
          vault: fx.vault,
        },
        { vote: votes[i]!, salt: salts[i]! },
      );
      await env.sendIx(instruction);
    }

    // --- finalize_round (crank; eligible after reveal_end) ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.revealEnd);
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
        jurorStakeAccounts,
      ),
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(ROUND_RESOLVED);

    // --- no appeal: warp the 3-day appeal window, then finalize_dispute ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.revealEnd + DEFAULT_APPEAL_WINDOW_SECS);
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
    expect(await readDisputeFinalRuling(env, armed.dispute)).toBe(0n);
  }, 300_000);
});
