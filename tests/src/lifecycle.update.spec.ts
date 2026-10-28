// lifecycle.update.spec.ts — propose/execute subaccord update with 48h slot timelock.
//
// Ports `programs/accord/tests/update_litesvm.rs` to TS + SDK + Surfpool:
//   createSubaccord(authority=<keypair>) → proposeSubaccordUpdate
//   → (execute reverts before timelock) → advance clock past deadline
//   → executeSubaccordUpdate → fetch Subaccord, assert the payload applied.
//
// The shared adapter hardcodes `accord.signer` as the signing authority AND the
// data-free rent payer (ADR-0028 wallet shape: a wallet authority pays its own
// PendingUpdate rent) for every lifecycle builder. To exercise the
// authority-gated `propose` path with a non-payer authority we construct a
// per-role `Accord` facade whose signer is the generated keypair — the
// resulting Instruction embeds that keypair as a signer, and `env.sendIx`
// signs with both the payer (fee) and the authority (instruction signer) via
// Kit's `signTransactionMessageWithSigners`. `execute` is permissionless, so
// it goes through the payer facade.
//
// SURFPOOL CLOCK NOTE: UPDATE_TIMELOCK_SLOTS (432_000) == slotsInEpoch, so on
// surfpool < 1.7.0 timeTravel's absoluteSlot wrapped modulo the epoch and could
// never reach the deadline — hence a raw Clock-sysvar surfnet_setAccount. Since
// surfpool 1.7.0 sysvar writes are rejected (managed sysvars, surfpool#895) and
// absoluteSlot lands exactly; we read executeAfterSlot from the PendingUpdate
// and warpToSlot() to it.
import {
  Accord,
  createSubaccord,
  proposeSubaccordUpdate,
  executeSubaccordUpdate,
  getSubaccordDecoder,
  getPendingUpdateDecoder,
  Aggregation,
  type UpdatePayload,
} from "@useaccord/sdk";
import type { Address } from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { warpToSlot } from "./setup/cheats.js";
import { createMint } from "./setup/tokens.js";
import { fetchDecoded } from "./setup/assertions.js";
import { defaultSubaccordArgs } from "./setup/fixtures.js";


describe("e2e: lifecycle.update (requires Surfpool)", () => {
  let env: TestEnv;
  let mint!: Address;

  beforeAll(async () => {
    env = await createTestEnv();
    if (env.up) mint = (await createMint(env, 6)).mint;
  }, 60_000);

  it("propose → (revert before timelock) → advance clock → execute applies MinStake", async () => {
    if (!env.up) return; // offline CI lane — see AGENTS.md "green rule"

    // ── 1. Real authority keypair (NOT DEFAULT_PUBKEY) ────────────────────
    // The authority is the facade signer, so it also carries the PendingUpdate
    // rent (ADR-0028 wallet shape) — fund it.
    const authority = await fundSigner(env);

    // ── 2. Mutable Subaccord with our authority ───────────────────────────
    const args = defaultSubaccordArgs(
      mint,
      mint,
      env.payer.address,
      {
        authority: authority.address,
      },
    );
    const { instruction: createIx, subaccord } = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    await env.sendIx(createIx);
    expect(
      (await fetchDecoded(env, subaccord, getSubaccordDecoder()))!.minStake,
    ).toBe(1_000n); // default

    // ── 3. Propose a MinStake update via the authority facade ─────────────
    // Build through a per-role Accord so the adapter's hardcoded `accord.signer`
    // is our authority keypair — the instruction carries it as a signer.
    const authorityAccord = new Accord({
      endpoint: env.rpcUrl,
      signer: authority,
    });
    const nonce = 7n;
    const payload: UpdatePayload = { __kind: "MinStake", fields: [9_999n] };
    const { instruction: proposeIx, pendingUpdate } =
      await proposeSubaccordUpdate(
        authorityAccord.adapter,
        env.programId,
        authority.address,
        subaccord,
        nonce,
        payload,
      );
    await env.sendIx(proposeIx);

    const pu = (await fetchDecoded(
      env,
      pendingUpdate,
      getPendingUpdateDecoder(),
    ))!;
    expect(pu.proposed.__kind).toBe("MinStake");
    const executeAfterSlot = pu.executeAfterSlot;

    // ── 4. Execute BEFORE the 48h timelock: must revert ───────────────────
    const execBeforeIx = executeSubaccordUpdate(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      subaccord,
      pendingUpdate,
    );
    await expect(env.sendIx(execBeforeIx)).rejects.toThrow();

    // Subaccord unchanged after the failed execute.
    expect(
      (await fetchDecoded(env, subaccord, getSubaccordDecoder()))!.minStake,
    ).toBe(1_000n);

    // ── 5. Advance the clock TO the deadline ─────────────────────────────
    // (exact absoluteSlot landing on surfpool >= 1.7.0 — see header note)
    await warpToSlot(env, executeAfterSlot);

    // ── 6. Execute AFTER timelock: payload applied ────────────────────────
    const execAfterIx = executeSubaccordUpdate(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      subaccord,
      pendingUpdate,
    );
    await env.sendIx(execAfterIx);

    // ── 7. The proposed field actually changed ────────────────────────────
    expect(
      (await fetchDecoded(env, subaccord, getSubaccordDecoder()))!.minStake,
    ).toBe(9_999n);
  }, 120_000);

  it("ADR-0028 variants: RevealThresholdBps + MaxDrawAttempts retune through the timelock", async () => {
    if (!env.up) return; // offline CI lane

    const authority = await fundSigner(env);
    const args = defaultSubaccordArgs(mint, mint, env.payer.address, {
      authority: authority.address,
    });
    const { instruction: createIx, subaccord } = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    await env.sendIx(createIx);

    const authorityAccord = new Accord({
      endpoint: env.rpcUrl,
      signer: authority,
    });

    // Two proposals, two nonces — the PendingUpdate namespace is per-nonce.
    const proposals: Array<[bigint, UpdatePayload]> = [
      [11n, { __kind: "RevealThresholdBps", fields: [8_000] }],
      [12n, { __kind: "MaxDrawAttempts", fields: [5] }],
    ];
    const pendings: Address[] = [];
    for (const [nonce, payload] of proposals) {
      const { instruction, pendingUpdate } = await proposeSubaccordUpdate(
        authorityAccord.adapter,
        env.programId,
        authority.address,
        subaccord,
        nonce,
        payload,
      );
      await env.sendIx(instruction);
      pendings.push(pendingUpdate);
    }

    // The two proposals land in different slots, so their ETAs differ by at
    // least one slot — arm the clock once past the LATEST deadline. warpToSlot
    // moves surfpool's internal clock, so the landing persists across blocks
    // (and timeTravel cannot jump backwards — each execute only advances the
    // slot further past maxEta, which still satisfies every deadline).
    const etas = await Promise.all(
      pendings.map(async (p) => {
        const pu = (await fetchDecoded(env, p, getPendingUpdateDecoder()))!;
        return pu.executeAfterSlot;
      }),
    );
    const maxEta = etas.reduce((a, b) => (a > b ? a : b));
    await warpToSlot(env, maxEta);

    for (const pendingUpdate of pendings) {
      await env.sendIx(
        executeSubaccordUpdate(
          env.accord.adapter,
          env.programId,
          env.payer.address,
          subaccord,
          pendingUpdate,
        ),
      );
    }
  }, 120_000);

  it("Median pool rejects RevealThresholdBps:0 at propose (SR2-M-1 cross-field gate)", async () => {
    if (!env.up) return; // offline CI lane

    const authority = await fundSigner(env);
    const args = defaultSubaccordArgs(mint, mint, env.payer.address, {
      authority: authority.address,
      aggregation: Aggregation.Median,
    });
    const { instruction: createIx, subaccord } = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    await env.sendIx(createIx);

    const authorityAccord = new Accord({
      endpoint: env.rpcUrl,
      signer: authority,
    });
    const { instruction: proposeIx } = await proposeSubaccordUpdate(
      authorityAccord.adapter,
      env.programId,
      authority.address,
      subaccord,
      1n,
      { __kind: "RevealThresholdBps", fields: [0] },
    );
    await expect(env.sendIx(proposeIx)).rejects.toThrow();

    // Nothing landed: no PendingUpdate at the nonce.
    expect(
      await fetchDecoded(
        env,
        (
          await proposeSubaccordUpdate(
            authorityAccord.adapter,
            env.programId,
            authority.address,
            subaccord,
            1n,
            { __kind: "RevealThresholdBps", fields: [6_666] }, // valid, NOT sent
          )
        ).pendingUpdate,
        getPendingUpdateDecoder(),
      ),
    ).toBeNull();
  }, 120_000);
});
