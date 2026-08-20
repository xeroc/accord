// scalar.spec.ts — scalar voting e2e (ADR-0025) against Surfpool: a Median
// pool files a ZERO-option dispute, jurors commit/reveal u64 fixed-point
// votes (settlement-mint base units), finalize_round writes the MEDIAN, and
// finalize_dispute settles coherence inside the ±1% (100 bps) band.
//
// Mirrors voting.spec.ts over `aggregation: Median` + `coherenceTolBps: 100`:
// stake → create_dispute(options: []) → injectCommittedVrf → draw_seat × 3 →
// commit → reveal → finalize_round (median) → finalize_dispute (band coherence).
import {
  commit,
  createSubaccord,
  encodeScalarVote,
  finalizeDispute,
  finalizeRound,
  findJurorStakePda,
  getJurorStakeDecoder,
  reveal,
  Aggregation,
  DEFAULT_APPEAL_WINDOW_SECS,
} from "@useaccord/sdk";
import { defaultSubaccordArgs, randomBytes32 } from "./setup/fixtures.js";
import { createMint } from "./setup/tokens.js";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import { fetchDecoded } from "./setup/assertions.js";
import {
  armDispute,
  armSubaccordAndJurors,
  ensurePause,
  readDisputeState,
  readDisputeFinalRuling,
  readRound,
  resolveDistinctPanel,
  submitDraw,
  toAddress,
  warpTo,
  type DrawFixture,
  type JurorCtx,
} from "./draw-harness.js";

/** DisputeState numeric tags (state.rs): Drawn=1, RoundResolved=5, Final=6. */
const DRAWN = 1;
const ROUND_RESOLVED = 5;
const FINAL = 6;

describe("e2e: scalar voting — Median aggregation + coherence band (requires Surfpool)", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("runs a scalar dispute end-to-end: median result, bps coherence, u64 ruling", async () => {
    if (!env.up) return; // offline CI lane

    // --- Median pool: ±1% coherence band around the final median ---
    const accordState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, accordState, {
      aggregation: Aggregation.Median,
      coherenceTolBps: 100,
    });
    const fx: DrawFixture = { env, up: true, ...core };

    const disputeNonce = crypto
      .getRandomValues(new Uint8Array(8))
      .reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);

    // Scalar disputes file with ZERO options — the vote is a u64 fixed-point
    // value, not an index.
    const armed = await armDispute(fx, disputeNonce, [], Aggregation.Median);

    const memberships = await resolveDistinctPanel(fx, armed);
    const roundPda = await submitDraw(fx, armed, memberships);
    expect(await readDisputeState(env, armed.dispute)).toBe(DRAWN);

    const drawnJurors: JurorCtx[] = memberships.map((m) => {
      const addr = toAddress(m.leaf.juror);
      const j = fx.jurors.find((x) => x.signer.address === addr);
      if (!j) throw new Error(`drawn juror not in staked set: ${addr}`);
      return j;
    });

    // "100.000000", "101.000000", "99.000000" (6-dec USDC base units).
    // Median = 100_000_000; the ±1M deviations sit exactly on the 100 bps
    // band edge — all three reveals are coherent.
    const votes = [
      encodeScalarVote("100.000000", 6),
      encodeScalarVote("101.000000", 6),
      encodeScalarVote("99.000000", 6),
    ];
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
      await env.sendIx(
        reveal(
          drawnJurors[i]!.accord.adapter,
          env.programId,
          {
            signer: drawnJurors[i]!.signer.address,
            subaccord: fx.subaccord,
            dispute: armed.dispute,
            round: roundPda,
          },
          { vote: votes[i]!, salt: salts[i]! },
        ),
      );
    }
    round = await readRound(env, roundPda);
    expect(round!.revealCount).toBe(drawnJurors.length);

    // --- finalize_round: the tally is the MEDIAN of the revealed scalars ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.revealEnd);
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

    const resolved = await readRound(env, roundPda);
    expect(resolved!.result).toBe(100_000_000n); // median
    expect(await readDisputeState(env, armed.dispute)).toBe(ROUND_RESOLVED);

    // --- finalize_dispute after the appeal window: ruling = final median ---
    if (!resolved) throw new Error("round vanished after finalize_round");
    await warpTo(env, resolved.revealEnd + DEFAULT_APPEAL_WINDOW_SECS + 1n);
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
        jurorStakePdas,
      ),
    );

    expect(await readDisputeState(env, armed.dispute)).toBe(FINAL);
    expect(await readDisputeFinalRuling(env, armed.dispute)).toBe(
      100_000_000n,
    );

    // All three reveals are inside the ±1% band ⇒ nobody slashed; every
    // revealer keeps the base participation fee credited at finalize_round.
    for (const pda of jurorStakePdas) {
      const js = await fetchDecoded(env, pda, getJurorStakeDecoder());
      expect(js!.stakeDelta).toBe(0n);
      expect(js!.feesEarned).toBe(1_000_000n);
      expect(js!.activeDraws).toBe(0);
    }
  }, 300_000);
  it("rejects a Median pool with revealThresholdBps = 0 (SR2-M1); Plurality stays legal", async () => {
    if (!env.up) return; // offline CI lane

    const mint = (await createMint(env, 6)).mint;

    // Median + zero threshold: the quorum gate collapses to needed = 0 and a
    // zero-reveal round would fabricate a median of 0 — rejected at creation
    // (the field is immutable, creation is its only write path).
    const medianArgs = defaultSubaccordArgs(mint, mint, env.payer.address, {
      aggregation: Aggregation.Median,
      revealThresholdBps: 0,
    });
    const median = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      medianArgs,
    );
    await expect(env.sendIx(median.instruction)).rejects.toThrow();

    // Plurality + zero threshold stays accepted: an all-zero tally ties and
    // ADR-0026 routes the round to RedrawEligible — zero participation can
    // never crown a winner.
    const pluralityArgs = defaultSubaccordArgs(mint, mint, env.payer.address, {
      aggregation: Aggregation.Plurality,
      revealThresholdBps: 0,
    });
    const plurality = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      pluralityArgs,
    );
    await env.sendIx(plurality.instruction);
  }, 120_000);
});
