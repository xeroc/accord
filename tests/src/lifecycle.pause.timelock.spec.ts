// lifecycle.pause.timelock.spec.ts — circuit-breaker pause/unpause with slot timelock.
//
// Ports the happy path of `programs/accord/tests/pause_litesvm.rs` to
// TS + SDK + Surfpool:
//   initializePause → pause → proposeUnpause
//   → (execute reverts before timelock) → warpForwardSlots(UNPAUSE_TIMELOCK_SLOTS)
//   → executeUnpause (paused cleared).
//
// The shared adapter hardcodes `accord.signer` (the TestEnv payer) as the pause
// authority for every lifecycle builder, so the payer is both fee-payer and
// authority. PauseState is a singleton — a fresh `--db :memory:` surfpool is
// required so `initializePause` succeeds exactly once.
import {
  initializePause,
  pause,
  proposeUnpause,
  executeUnpause,
  getPauseStateDecoder,
  UNPAUSE_TIMELOCK_SLOTS,
} from "@accord/sdk";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import { warpForwardSlots } from "./setup/cheats.js";
import { fetchDecoded } from "./setup/assertions.js";

describe("e2e: lifecycle.pause.timelock (requires Surfpool)", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("full pause → propose_unpause → timelock → execute_unpause", async () => {
    if (!env.up) return; // offline CI lane — see AGENTS.md "green rule"

    // ── ensure PauseState exists (idempotent — singleton shared across specs on
    //    one Surfnet; skip init if a sibling already created it) ─────────────
    const { pauseState } = await initializePause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
    );
    const existing = await env.rpc
      .getAccountInfo(pauseState, { encoding: "base64" })
      .send();
    if (!existing.value) {
      const { instruction: initIx } = await initializePause(
        env.accord.adapter,
         env.programId,
         env.payer.address,
      );
      await env.sendIx(initIx);
    }
    expect(
      (await fetchDecoded(env, pauseState, getPauseStateDecoder()))!.paused,
    ).toBe(false);

    // ── pause: instant emergency freeze ───────────────────────────────────
    await env.sendIx(
      pause(env.accord.adapter, env.programId, env.payer.address, pauseState),
    );
    expect(
      (await fetchDecoded(env, pauseState, getPauseStateDecoder()))!.paused,
    ).toBe(true);

    // ── proposeUnpause: arms the 24h notice timelock (pendingUnpauseAfter) ──
    await env.sendIx(
      proposeUnpause(env.accord.adapter, env.programId, env.payer.address, pauseState),
    );

    // ── proposeUnpause: arms the 24h timelock ─────────────────────────────
    const afterPropose = await fetchDecoded(
      env,
      pauseState,
      getPauseStateDecoder(),
    );
    expect(afterPropose).not.toBeNull();
    expect(afterPropose!.paused).toBe(true); // still paused until execute
    expect(afterPropose!.pendingUnpauseAfter.__option).toBe("Some");

    // ── execute BEFORE timelock: must revert (UnpauseTimelockNotElapsed) ──
    const execBeforeIx = executeUnpause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      pauseState,
    );
    await expect(env.sendIx(execBeforeIx)).rejects.toThrow();

    // ── warp past the 24h notice slot ─────────────────────────────────────
    await warpForwardSlots(env, UNPAUSE_TIMELOCK_SLOTS);

    // ── execute AFTER timelock: unpause lands ─────────────────────────────
    await env.sendIx(
      executeUnpause(env.accord.adapter, env.programId, env.payer.address, pauseState),
    );
    const afterExec = await fetchDecoded(
      env,
      pauseState,
      getPauseStateDecoder(),
    );
    expect(afterExec).not.toBeNull();
    expect(afterExec!.paused).toBe(false);
    expect(afterExec!.pendingUnpauseAfter.__option).toBe("None");
  }, 120_000);
});
