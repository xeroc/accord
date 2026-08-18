// draw.spec.ts — e2e: per-seat draw with deterministic collision re-roll.
//
// Drives @useaccord/sdk over Surfpool:
//   - happy path: resolveDistinctPanel → draw_seat × N → Round carries the
//     resolved panel + active_draws increments + dispute → Drawn.
//   - vrfSeed determinism (pure).
//
// The collision re-roll is exercised implicitly — `resolveSeat` finds the
// correct (leaf, retries) pair per seat; the on-chain `draw_seat` verifies each
// prior retry genuinely collided. The full fabrication-rejection test is in
// LiteSVM (accumulator_litesvm.rs).
//
// injectCommittedVrf (setup/vrf.ts) writes `committed_vrf` + `frozen_root`
// directly via surfnet_setAccount. Requires Surfpool on port 8905; auto-skips
// on the offline CI lane (fx.up === false).
import { vrfSeed } from "@useaccord/sdk";

import {
  armDispute,
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

/** DisputeState numeric tags. */
const DRAWN = 1; // ADR-0012: DisputeState::Drawn shifted to 1 (SnapshotPosted removed)

describe("e2e: draw_seat (accumulator + deterministic sortition) — requires Surfpool port 8905", () => {
  let fx: DrawFixture;

  beforeAll(async () => {
    fx = await setupDrawFixture();
  }, 90_000);

  it("draw_seat fills the panel and writes it to the Round", async () => {
    if (!fx.up) return; // offline CI lane

    // Random nonce ⇒ unique Dispute PDA per run (the filer is fixed) — keeps
    // the spec re-runnable on a persistent Surfnet.
    const nonce = crypto
      .getRandomValues(new Uint8Array(8))
      .reduce((acc, b, i) => acc | (BigInt(b) << BigInt(i * 8)), 0n);
    const armed = await armDispute(fx, nonce);
    const memberships = await resolveDistinctPanel(fx, armed);
    const jurorStakeAccounts = jurorStakeAccountsFor(fx, memberships);
    const roundPda = await submitDraw(fx, armed, memberships);

    // Dispute transitions Created → Drawn.
    expect(await readDisputeState(fx.env, armed.dispute)).toBe(DRAWN);

    const round = await readRound(fx.env, roundPda);
    expect(round).not.toBeNull();
    expect(round!.jurorCount).toBe(PANEL_SIZE);

    // The on-chain jurors match the resolved memberships, in order, and are all
    // real staked jurors.
    const drawnSet = new Set<string>();
    for (let i = 0; i < PANEL_SIZE; i++) {
      const expected = toAddress(memberships[i]!.leaf.juror);
      expect(round!.jurors[i]).toBe(expected);
      drawnSet.add(expected);
    }
    for (const j of fx.jurors) {
      expect(drawnSet.has(j.signer.address)).toBe(true);
    }

    // active_draws frozen to 1 for every drawn juror.
    for (const pda of jurorStakeAccounts) {
      expect(await readJurorActiveDraws(fx.env, pda)).toBe(1);
    }
  }, 180_000);

  it("vrfSeed is deterministic and binds to the committed VRF (pure)", async () => {
    const disputeBytes = new Uint8Array(32).fill(7);
    const a = await vrfSeed(COMMITTED_VRF, disputeBytes, 0);
    const b = await vrfSeed(COMMITTED_VRF, disputeBytes, 0);
    expect(a).toEqual(b);

    const other = await vrfSeed(new Uint8Array(32).fill(43), disputeBytes, 0);
    expect(other).not.toEqual(a);
  });
});
