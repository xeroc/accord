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
// authority. AccordState is a singleton — a fresh `--db :memory:` surfpool is
// required so `initializePause` succeeds exactly once.
import {
  initializePause,
  pause,
  proposeUnpause,
  executeUnpause,
  getAccordStateDecoder,
  UNPAUSE_TIMELOCK_SLOTS,
} from "@useaccord/sdk";

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

    // ── ensure AccordState exists (idempotent — singleton shared across specs on
    //    one Surfnet; skip init if a sibling already created it) ─────────────
    const { accordState } = await initializePause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
    );
    const existing = await env.rpc
      .getAccountInfo(accordState, { encoding: "base64" })
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
      (await fetchDecoded(env, accordState, getAccordStateDecoder()))!.paused,
    ).toBe(false);

    // ── pause: instant emergency freeze ───────────────────────────────────
    await env.sendIx(
      pause(env.accord.adapter, env.programId, env.payer.address, accordState),
    );
    expect(
      (await fetchDecoded(env, accordState, getAccordStateDecoder()))!.paused,
    ).toBe(true);

    // ── proposeUnpause: arms the 24h notice timelock (pendingUnpauseAfter) ──
    await env.sendIx(
      proposeUnpause(env.accord.adapter, env.programId, env.payer.address, accordState),
    );

    // ── proposeUnpause: arms the 24h timelock ─────────────────────────────
    const afterPropose = await fetchDecoded(
      env,
      accordState,
      getAccordStateDecoder(),
    );
    expect(afterPropose).not.toBeNull();
    expect(afterPropose!.paused).toBe(true); // still paused until execute
    expect(afterPropose!.pendingUnpauseAfter.__option).toBe("Some");

    // ── execute BEFORE timelock: must revert (UnpauseTimelockNotElapsed) ──
    const execBeforeIx = executeUnpause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      accordState,
    );
    await expect(env.sendIx(execBeforeIx)).rejects.toThrow();

    // ── warp past the 24h notice slot ─────────────────────────────────────
    await warpForwardSlots(env, UNPAUSE_TIMELOCK_SLOTS);

    // ── execute AFTER timelock: unpause lands ─────────────────────────────
    await env.sendIx(
      executeUnpause(env.accord.adapter, env.programId, env.payer.address, accordState),
    );
    const afterExec = await fetchDecoded(
      env,
      accordState,
      getAccordStateDecoder(),
    );
    expect(afterExec).not.toBeNull();
    expect(afterExec!.paused).toBe(false);
    expect(afterExec!.pendingUnpauseAfter.__option).toBe("None");
  }, 120_000);

  // Crash safety: this is the ONLY spec that pauses the program. If the body
  // dies between `pause` and `execute_unpause` (e.g. a Surfnet cheatcode
  // hiccup — surfpool 1.7.0's surfnet_setAccount Internal error, 2026-10-28),
  // the singleton stays paused and every sibling spec on this Surfnet fails
  // with #6010 ProgramPaused. Lift the pause best-effort on teardown.
  afterAll(async () => {
    if (!env?.up) return;
    try {
      const { accordState } = await initializePause(
        env.accord.adapter,
        env.programId,
        env.payer.address,
      );
      const state = await fetchDecoded(env, accordState, getAccordStateDecoder());
      if (!state?.paused) return;
      await env.sendIx(
        proposeUnpause(env.accord.adapter, env.programId, env.payer.address, accordState),
      );
      await warpForwardSlots(env, UNPAUSE_TIMELOCK_SLOTS);
      await env.sendIx(
        executeUnpause(env.accord.adapter, env.programId, env.payer.address, accordState),
      );
    } catch {
      // best effort — the Surfnet may itself be wedged; nothing more to do
    }
  });
});
