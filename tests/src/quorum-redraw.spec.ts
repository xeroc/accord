// quorum-redraw.spec.ts — ADR-0021 e2e: reveal-quorum threshold + shortfall
// redraw, against a running Surfpool instance.
//
// Mirrors the LiteSVM scenarios (bean accord-84vk) over the full SDK ↔ program
// ↔ Surfnet stack:
//   1. shortfall → RedrawEligible → redraw → Created (draw_attempt++) →
//      re-draw → full reveal → RoundResolved (+ no-show slash retained).
//   2. Failed-on-exhaust (max_draw_attempts = 1): filer fee_paid refunded,
//      no-show slashes retained.
//
// Uses the shared draw-harness (armSubaccordAndJurors → armDispute →
// resolveDistinctPanel → submitDraw) for the initial panel, then the SDK
// redraw() facade + a draw_attempt-aware resolveSeat for the shortfall path.
import {
  commit,
  reveal,
  finalizeRound,
  redraw,
  resolveSeat,
  getDisputeDecoder,
  getRoundDecoder,
  getJurorStakeDecoder,
  type SeatMembership,
} from "@useaccord/sdk";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import { TOKEN_PROGRAM_ID } from "./setup/tokens.js";
import { fetchDecoded } from "./setup/assertions.js";
import {
  armSubaccordAndJurors,
  ensurePause,
  armDispute,
  resolveDistinctPanel,
  submitDraw,
  readDisputeState,
  readRound,
  warpTo,
  toAddress,
  toHex,
  ataOf,
  COMMITTED_VRF,
  FEE_PER_JUROR,
  PANEL_SIZE,
  type DrawFixture,
  type JurorCtx,
  type ArmedDispute,
} from "./draw-harness.js";

// DisputeState numeric tags (state.rs).
const CREATED = 0;
const ROUND_RESOLVED = 5;
const FAILED = 8;
const REDRAW_ELIGIBLE = 9;

/** Resolve a full PANEL_SIZE panel with an explicit `drawAttempt` (re-draw). */
async function resolvePanelAttempt(
  fx: DrawFixture,
  armed: ArmedDispute,
  drawAttempt: number,
): Promise<SeatMembership[]> {
  const drawn: Uint8Array[] = [];
  const memberships: SeatMembership[] = [];
  for (let seat = 0; seat < PANEL_SIZE; seat++) {
    const r = await resolveSeat(
      COMMITTED_VRF,
      armed.disputeBytes,
      0, // roundIdx
      seat,
      fx.tree.tree,
      drawn,
      1024, // maxRetries
      drawAttempt,
    );
    const pda = fx.jurorPdaByHex.get(toHex(r.leaf.juror));
    if (!pda)
      throw new Error(`no JurorStake PDA for juror ${toHex(r.leaf.juror)}`);
    memberships.push({
      leaf: r.leaf,
      index: r.index,
      proof: r.proof,
      jurorStake: pda,
      retries: r.retries,
    });
    drawn.push(r.leaf.juror);
  }
  return memberships;
}

/** Map drawn memberships back to staked JurorCtx (panel is VRF-sorted). */
function jurorsOf(fx: DrawFixture, ms: SeatMembership[]): JurorCtx[] {
  return ms.map((m) => {
    const addr = toAddress(m.leaf.juror);
    const j = fx.jurors.find((x) => x.signer.address === addr);
    if (!j) throw new Error(`drawn juror not in staked set: ${addr}`);
    return j;
  });
}

/** Random u64 nonce ⇒ unique Dispute PDA ⇒ re-runnable on the same Surfnet. */
function randomNonce(): bigint {
  return crypto
    .getRandomValues(new Uint8Array(8))
    .reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);
}

describe("e2e: ADR-0021 reveal quorum + shortfall redraw (requires Surfpool)", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("shortfall → RedrawEligible → redraw → Created → re-draw → threshold → RoundResolved", async () => {
    if (!env.up) return; // offline CI lane

    // --- setup: pause + subaccord (threshold 6666 = 2/3) + 3 staked jurors ---
    const pauseState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, pauseState);
    const fx: DrawFixture = { env, up: true, ...core };
    const armed = await armDispute(fx, randomNonce());

    // --- initial draw (draw_attempt = 0) ---
    const memberships = await resolveDistinctPanel(fx, armed);
    const roundPda = await submitDraw(fx, armed, memberships);
    const drawn = jurorsOf(fx, memberships);
    expect(await readDisputeState(env, armed.dispute)).not.toBe(CREATED);

    // --- only juror 0 commits + reveals (1/3 < ceil(3 × 6666/10000) = 2) ---
    let round = await readRound(env, roundPda);
    await warpTo(env, round!.reviewEnd);
    const salt0 = crypto.getRandomValues(new Uint8Array(32));
    const { instruction: commitIx } = await commit(
      drawn[0]!.accord.adapter,
      env.programId,
      {
        signer: drawn[0]!.signer.address,
        subaccord: fx.subaccord,
        dispute: armed.dispute,
        round: roundPda,
      },
      { vote: 0, salt: salt0 },
    );
    await env.sendIx(commitIx);

    await warpTo(env, round!.commitEnd);
    await env.sendIx(
      reveal(
        drawn[0]!.accord.adapter,
        env.programId,
        {
          signer: drawn[0]!.signer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
          stakingToken: fx.mint,
          jurorTokenAccount: drawn[0]!.jurorAta,
          vault: fx.vault,
        },
        { vote: 0, salt: salt0 },
      ),
    );

    // --- finalize_round → RedrawEligible (shortfall; no credits, no result) ---
    await warpTo(env, round!.revealEnd);
    const panelPdas = memberships.map((m) => m.jurorStake);
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
        panelPdas,
      ),
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(REDRAW_ELIGIBLE);

    // --- redraw → Created + draw_attempt = 1 + round cleared ---
    const filerAta = await ataOf(fx.mint, env.payer.address);
    await env.sendIx(
      redraw(
        env.accord.adapter,
        env.programId,
        {
          caller: env.payer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
          feeToken: fx.mint,
          filerTokenAccount: filerAta,
          feeVault: fx.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        panelPdas,
      ),
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(CREATED);

    const rd = await fetchDecoded(env, roundPda, getRoundDecoder());
    expect(rd?.drawAttempt).toBe(1);
    expect(rd?.jurorCount).toBe(0);

    // No-show jurors (1, 2) carry a permanent stake_delta slash; revealer (0) does not.
    for (let i = 1; i < drawn.length; i++) {
      const js = await fetchDecoded(
        env,
        drawn[i]!.stakePda,
        getJurorStakeDecoder(),
      );
      expect(Number(js?.stakeDelta ?? 0)).toBeLessThan(0);
    }
    const js0 = await fetchDecoded(
      env,
      drawn[0]!.stakePda,
      getJurorStakeDecoder(),
    );
    expect(Number(js0?.stakeDelta ?? 0)).toBe(0);

    // --- re-draw with draw_attempt = 1 (fresh seats via the orthogonal seed) ---
    const reMemberships = await resolvePanelAttempt(fx, armed, 1);
    await submitDraw(fx, armed, reMemberships);
    const reDrawn = jurorsOf(fx, reMemberships);

    // --- all 3 commit + reveal → threshold met ---
    round = await readRound(env, roundPda);
    await warpTo(env, round!.reviewEnd);
    const salts = reDrawn.map(() => crypto.getRandomValues(new Uint8Array(32)));
    for (let i = 0; i < reDrawn.length; i++) {
      const { instruction } = await commit(
        reDrawn[i]!.accord.adapter,
        env.programId,
        {
          signer: reDrawn[i]!.signer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
        },
        { vote: 0, salt: salts[i]! },
      );
      await env.sendIx(instruction);
    }
    await warpTo(env, round!.commitEnd);
    for (let i = 0; i < reDrawn.length; i++) {
      await env.sendIx(
        reveal(
          reDrawn[i]!.accord.adapter,
          env.programId,
          {
            signer: reDrawn[i]!.signer.address,
            subaccord: fx.subaccord,
            dispute: armed.dispute,
            round: roundPda,
            stakingToken: fx.mint,
            jurorTokenAccount: reDrawn[i]!.jurorAta,
            vault: fx.vault,
          },
          { vote: 0, salt: salts[i]! },
        ),
      );
    }

    // --- finalize_round → RoundResolved (fees credited) ---
    await warpTo(env, round!.revealEnd);
    const rePanelPdas = reMemberships.map((m) => m.jurorStake);
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
        rePanelPdas,
      ),
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(ROUND_RESOLVED);

    const finalRound = await readRound(env, roundPda);
    expect(finalRound!.result).toBe(0); // unanimous option 0

    // Each revealer's feesEarned credited (ADR-0020).
    for (const j of reDrawn) {
      const js = await fetchDecoded(env, j.stakePda, getJurorStakeDecoder());
      expect(js?.feesEarned).toBe(BigInt(FEE_PER_JUROR));
    }
  }, 600_000);

  it("Failed on draw_attempt exhaustion: filer fee_paid refunded, slashes retained", async () => {
    if (!env.up) return; // offline CI lane

    const pauseState = await ensurePause(env);
    const core = await armSubaccordAndJurors(env, pauseState, {
      maxDrawAttempts: 1,
    });
    const fx: DrawFixture = { env, up: true, ...core };
    const armed = await armDispute(fx, randomNonce());

    // --- initial draw ---
    const memberships = await resolveDistinctPanel(fx, armed);
    const roundPda = await submitDraw(fx, armed, memberships);
    const drawn = jurorsOf(fx, memberships);

    // --- only juror 0 reveals (1/3 < 2 → shortfall) ---
    const round = await readRound(env, roundPda);
    await warpTo(env, round!.reviewEnd);
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const { instruction: commitIx } = await commit(
      drawn[0]!.accord.adapter,
      env.programId,
      {
        signer: drawn[0]!.signer.address,
        subaccord: fx.subaccord,
        dispute: armed.dispute,
        round: roundPda,
      },
      { vote: 0, salt },
    );
    await env.sendIx(commitIx);
    await warpTo(env, round!.commitEnd);
    await env.sendIx(
      reveal(
        drawn[0]!.accord.adapter,
        env.programId,
        {
          signer: drawn[0]!.signer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
          stakingToken: fx.mint,
          jurorTokenAccount: drawn[0]!.jurorAta,
          vault: fx.vault,
        },
        { vote: 0, salt },
      ),
    );

    // --- finalize → RedrawEligible ---
    await warpTo(env, round!.revealEnd);
    const panelPdas = memberships.map((m) => m.jurorStake);
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
        panelPdas,
      ),
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(REDRAW_ELIGIBLE);

    // Capture fee_paid before redraw (filer paid panel × fee_per_juror).
    const before = await fetchDecoded(env, armed.dispute, getDisputeDecoder());
    expect(Number(before?.feePaid ?? 0)).toBeGreaterThan(0);

    // --- redraw → Failed (new_draw_attempt 1 ≥ max_draw_attempts 1) ---
    const filerAta = await ataOf(fx.mint, env.payer.address);
    await env.sendIx(
      redraw(
        env.accord.adapter,
        env.programId,
        {
          caller: env.payer.address,
          subaccord: fx.subaccord,
          dispute: armed.dispute,
          round: roundPda,
          feeToken: fx.mint,
          filerTokenAccount: filerAta,
          feeVault: fx.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        panelPdas,
      ),
    );
    expect(await readDisputeState(env, armed.dispute)).toBe(FAILED);

    // Filer refunded: fee_paid zeroed.
    const after = await fetchDecoded(env, armed.dispute, getDisputeDecoder());
    expect(after?.feePaid).toBe(0n);

    // No-show slashes retained.
    for (let i = 1; i < drawn.length; i++) {
      const js = await fetchDecoded(
        env,
        drawn[i]!.stakePda,
        getJurorStakeDecoder(),
      );
      expect(Number(js?.stakeDelta ?? 0)).toBeLessThan(0);
    }
  }, 600_000);
});
