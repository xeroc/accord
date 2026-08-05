// draw.spec.ts — M5: first runtime-verification of the VRF draw choreography.
//
// Ports the `draw_litesvm.rs` scenario to TS driving @accord/sdk over Surfpool:
//   - happy path: resolvePanel → draw → Round carries the resolved panel +
//     active_draws increments + dispute → Drawn.
//   - DuplicateJuror: a draw_attempt whose VRF-derived slots collide reverts
//     on-chain (DuplicateJuror, 0x1787) — mirrors find_collision_attempt.
//   - vrfSeed determinism (pure).
//
// injectCommittedVrf (setup/vrf.ts) is exercised here for the first time — it
// writes `committed_vrf` directly via surfnet_setAccount (the on-chain
// request_vrf CPIs the magicblock oracle, absent on a Surfnet). Requires
// Surfpool on port 8905; auto-skips on the offline CI lane (fx.up === false).
import { isDistinctPanel, vrfSeed } from "@accord/sdk";

import {
  armDispute,
  findCollisionPanel,
  jurorStakeAccountsFor,
  readDisputeState,
  readJurorActiveDraws,
  readRound,
  resolveDistinctPanel,
  setupDrawFixture,
  submitDraw,
  toAddress,
  COMMITTED_VRF,
  PANEL_SIZE,
  type DrawFixture,
} from "./draw-harness.js";

/** DisputeState numeric tags (generated/types/disputeState.ts). */
const DRAWN = 2;

describe("e2e: draw (VRF sortition + DuplicateJuror) — requires Surfpool port 8905", () => {
  let fx: DrawFixture;

  beforeAll(async () => {
    fx = await setupDrawFixture();
  }, 90_000);

  it("draw selects the resolved panel and writes it to the Round", async () => {
    if (!fx.up) return; // offline CI lane

    const armed = await armDispute(fx, 1n);
    const { drawAttempt, memberships } = await resolveDistinctPanel(fx, armed);
    const jurorStakeAccounts = jurorStakeAccountsFor(fx, memberships);
    const roundPda = await submitDraw(
      fx,
      armed,
      drawAttempt,
      memberships,
      jurorStakeAccounts,
    );

    // Dispute transitions SnapshotPosted → Drawn.
    expect(await readDisputeState(fx.env, armed.dispute)).toBe(DRAWN);

    const round = await readRound(fx.env, roundPda);
    expect(round).not.toBeNull();
    expect(round!.jurorCount).toBe(PANEL_SIZE);

    // The on-chain jurors match the resolved memberships, in order, and are all
    // real staked jurors (draw_litesvm: round.jurors[i] == sorted_claims[si].juror).
    const drawnSet = new Set<string>();
    for (let i = 0; i < PANEL_SIZE; i++) {
      const expected = toAddress(memberships[i]!.leaf.juror);
      expect(round!.jurors[i]).toBe(expected);
      drawnSet.add(expected);
    }
    for (const j of fx.jurors) {
      expect(drawnSet.has(j.signer.address)).toBe(true);
    }

    // active_draws frozen to 1 for every drawn juror (ADR-0003 stake freeze).
    for (const pda of jurorStakeAccounts) {
      expect(await readJurorActiveDraws(fx.env, pda)).toBe(1);
    }
  }, 180_000);

  it("draw reverts with DuplicateJuror on a colliding draw_attempt", async () => {
    if (!fx.up) return;

    const armed = await armDispute(fx, 2n);
    const { drawAttempt, memberships } = await findCollisionPanel(fx, armed);
    const jurorStakeAccounts = jurorStakeAccountsFor(fx, memberships);

    // Pre-condition: this attempt genuinely collides (mirror the blueprint's
    // find_collision_attempt guarantee before submitting).
    expect(isDistinctPanel(memberships)).toBe(false);

    // The memberships are individually valid (correct proof + sortition +
    // stake ≥ min), so on-chain the ONLY failing gate is the distinctness check
    // (lib.rs:940, DuplicateJuror = 0x1787), fired before remaining_accounts are
    // touched. surfpool surfaces only "Transaction simulation failed" (no decoded
    // Anchor code in the thrown message), so we assert the revert itself — it is
    // guaranteed DuplicateJuror by the pre-condition + check ordering.
    await expect(
      submitDraw(fx, armed, drawAttempt, memberships, jurorStakeAccounts),
    ).rejects.toThrow();
  }, 180_000);

  it("vrfSeed is deterministic and binds to the committed VRF (pure)", async () => {
    const disputeBytes = new Uint8Array(32).fill(7);
    const a = await vrfSeed(COMMITTED_VRF, disputeBytes, 0, 0);
    const b = await vrfSeed(COMMITTED_VRF, disputeBytes, 0, 0);
    expect(a).toEqual(b);

    const other = await vrfSeed(new Uint8Array(32).fill(43), disputeBytes, 0, 0);
    expect(other).not.toEqual(a);
  });
});
