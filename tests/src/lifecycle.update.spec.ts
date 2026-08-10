// lifecycle.update.spec.ts — propose/execute subaccord update with 48h slot timelock.
//
// Ports the happy path of `programs/accord/tests/update_litesvm.rs` to
// TS + SDK + Surfpool:
//   createSubaccord(authority=<keypair>) → proposeSubaccordUpdate(MinStake)
//   → (execute reverts before timelock) → advance clock past deadline
//   → executeSubaccordUpdate → fetch Subaccord, assert minStake changed.
//
// The shared adapter hardcodes `accord.signer` as the signing authority for
// every lifecycle builder. To exercise the authority-gated `propose` path with
// a non-payer authority we construct a per-role `Accord` facade whose signer is
// the generated keypair — the resulting Instruction embeds that keypair as a
// signer, and `env.sendIx` signs with both the payer (fee) and the authority
// (instruction signer) via Kit's `signTransactionMessageWithSigners`.
// `execute` is permissionless, so it goes through the payer facade.
//
// SURFPOOL CLOCK NOTE: UPDATE_TIMELOCK_SLOTS (432_000) == slotsInEpoch, so
// warpForwardSlots wraps the Clock sysvar's slot modulo the epoch and can never
// reach the deadline. We fix this by reading executeAfterSlot from the
// PendingUpdate and directly overwriting the Clock sysvar's slot field to that
// value via surfnet_setAccount (the cheatcode equivalent of the LiteSVM
// warp_to_slot).
import {
  Accord,
  createSubaccord,
  proposeSubaccordUpdate,
  executeSubaccordUpdate,
  getSubaccordDecoder,
  getPendingUpdateDecoder,
  UPDATE_TIMELOCK_SLOTS,
  type UpdatePayload,
} from "@useaccord/sdk";
import type { Address } from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { warpForwardSlots, setAccountRaw } from "./setup/cheats.js";
import { createMint } from "./setup/tokens.js";
import { fetchDecoded } from "./setup/assertions.js";
import { defaultSubaccordArgs } from "./setup/fixtures.js";

const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111" as Address;

/**
 * Overwrite the Clock sysvar's `slot` field (u64@0) to an absolute value,
 * preserving the other fields. Works around the surfpool Clock slotIndex wrap
 * (UPDATE_TIMELOCK_SLOTS == slotsInEpoch == 432_000).
 */
async function setClockSlot(env: TestEnv, slot: bigint): Promise<void> {
  const res = await env.rpc
    .getAccountInfo(CLOCK_SYSVAR, { encoding: "base64" })
    .send();
  if (!res.value) throw new Error("Clock sysvar not found");
  const bytes = new Uint8Array(Buffer.from(res.value.data[0], "base64"));
  // slot: u64 LE at offset 0
  const dv = new DataView(bytes.buffer);
  dv.setBigUint64(0, slot, true);
  await setAccountRaw(env, CLOCK_SYSVAR, {
    lamports: Number(res.value.lamports),
    data: bytes, // Uint8Array → setAccountRaw converts to hex
    owner: res.value.owner as Address,
    executable: false,
    rentEpoch: 0,
  });
}

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
    // The authority pays rent for the PendingUpdate `init` in propose, so fund it.
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

    // ── 5. Advance the clock past the 48h deadline ────────────────────────
    // warpForwardSlots updates the surfnet's internal clock; then we fix the
    // Clock sysvar's slot to the deadline (surfpool wraps slot at
    // slotsInEpoch == UPDATE_TIMELOCK_SLOTS, so a direct set is required).
    await warpForwardSlots(env, UPDATE_TIMELOCK_SLOTS);
    await setClockSlot(env, executeAfterSlot);

    // ── 6. Execute AFTER timelock: payload applied ────────────────────────
    const execAfterIx = executeSubaccordUpdate(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      subaccord,
      pendingUpdate,
    );
    await env.sendIx(execAfterIx);

    // ── 7. The proposed field actually changed ───────────────────────────
    expect(
      (await fetchDecoded(env, subaccord, getSubaccordDecoder()))!.minStake,
    ).toBe(9_999n);
  }, 120_000);
});
