// canon.update.spec.ts — Canon retuning path against Surfpool (accord-gou8).
//
// update_list: instant effect (no timelock) + wrong-authority revert.
// propose_court_update: CPI propose (CanonList PDA signs as the Subaccord
//   authority; caller pays rent) → 48h slot timelock → DIRECT Accord
//   execute_subaccord_update (permissionless — no canon wrapper) →
//   Subaccord fields mutated. The Authority payload variant is rejected.
//
// Uses the real `createList` CPI (needs a backing Subaccord for the court
// path). The list creator is a dedicated funded keypair so the authority gate
// is exercised against a wallet that is NOT the fee payer.
//
// SURFPOOL CLOCK NOTE: same workaround as lifecycle.update.spec.ts —
// UPDATE_TIMELOCK_SLOTS == slotsInEpoch, so warpForwardSlots wraps the Clock
// sysvar's slot; we overwrite the slot field directly via surfnet_setAccount.
import {
  CANON_PROGRAM_ID,
  createList,
  defaultCourtParams,
  updateList,
  proposeCourtUpdate,
  getCanonListDecoder,
} from "@useaccord/canon";
import {
  executeSubaccordUpdate,
  getPendingUpdateDecoder,
  getSubaccordDecoder,
  UPDATE_TIMELOCK_SLOTS,
  type UpdatePayload,
} from "@useaccord/sdk";
import {
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { warpForwardSlots, setAccountRaw } from "./setup/cheats.js";
import { createMint } from "./setup/tokens.js";
import { fetchDecoded } from "./setup/assertions.js";
import { DEFAULT_PUBKEY } from "./setup/fixtures.js";

const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111" as Address;

/**
 * Overwrite the Clock sysvar's `slot` field (u64@0) to an absolute value —
 * copy of the lifecycle.update.spec.ts helper (surfpool wraps slot at
 * slotsInEpoch == UPDATE_TIMELOCK_SLOTS).
 */
async function setClockSlot(env: TestEnv, slot: bigint): Promise<void> {
  const res = await env.rpc
    .getAccountInfo(CLOCK_SYSVAR, { encoding: "base64" })
    .send();
  if (!res.value) throw new Error("Clock sysvar not found");
  const bytes = new Uint8Array(Buffer.from(res.value.data[0], "base64"));
  const dv = new DataView(bytes.buffer);
  dv.setBigUint64(0, slot, true);
  await setAccountRaw(env, CLOCK_SYSVAR, {
    lamports: Number(res.value.lamports),
    data: bytes,
    owner: res.value.owner as Address,
    executable: false,
    rentEpoch: 0,
  });
}

describe("e2e: canon.update — retuning path (requires Surfpool)", () => {
  let env: TestEnv;
  let authority: KeyPairSigner;
  let list: Address;
  let subaccord: Address;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return; // offline CI lane — see AGENTS.md "green rule"

    // Dedicated governance wallet — creator at create_list, so the list
    // authority is provably NOT the fee payer.
    authority = await fundSigner(env);
    const mint = (await createMint(env, 6)).mint;

    const { instruction: createIx, list: l, subaccord: s } = await createList(
      { creator: authority, stakeMint: mint, feeMint: mint },
      {
        listProgram: DEFAULT_PUBKEY, // sentinel ⇒ ownership off
        evidenceOperator: env.payer.address,
        rulesHash: crypto.getRandomValues(new Uint8Array(32)),
        submitDeposit: 500n,
        challengePct: 5_000,
        listingWindow: 43_200n,
        withdrawalTimelock: 43_200n,
        court: defaultCourtParams(),
      },
      CANON_PROGRAM_ID,
    );
    await env.sendIx(createIx);
    list = l;
    subaccord = s;

    // Governance model: the creator (not the list PDA) is CanonList.authority.
    const created = (await fetchDecoded(env, list, getCanonListDecoder()))!;
    expect(created.authority).toBe(authority.address);
  }, 60_000);

  it("update_list applies list params instantly", async () => {
    if (!env.up) return; // offline CI lane

    const ix = updateList(
      { authority, list },
      {
        submitDeposit: 1_234n,
        challengePct: 2_500,
        listingWindow: 3_600n,
        withdrawalTimelock: 7_200n,
        newAuthority: DEFAULT_PUBKEY, // sentinel ⇒ no rotation
      },
      CANON_PROGRAM_ID,
    );
    await env.sendIx(ix);

    const updated = (await fetchDecoded(env, list, getCanonListDecoder()))!;
    expect(updated.submitDeposit).toBe(1_234n);
    expect(updated.challengePct).toBe(2_500);
    expect(updated.listingWindow).toBe(3_600n);
    expect(updated.withdrawalTimelock).toBe(7_200n);
    // Sentinel kept the governance key.
    expect(updated.authority).toBe(authority.address);
  }, 120_000);

  it("update_list: non-authority wallet is rejected (Unauthorized)", async () => {
    if (!env.up) return; // offline CI lane
    const stranger = await generateKeyPairSigner();

    const ix = updateList(
      { authority: stranger, list },
      {
        submitDeposit: 1_000n,
        challengePct: 2_500,
        listingWindow: 3_600n,
        withdrawalTimelock: 7_200n,
      },
      CANON_PROGRAM_ID,
    );
    await expect(env.sendIx(ix)).rejects.toThrow();

    // Nothing changed.
    const unchanged = (await fetchDecoded(env, list, getCanonListDecoder()))!;
    expect(unchanged.submitDeposit).toBe(1_234n);
  }, 120_000);

  it("propose_court_update → timelock → direct Accord execute mutates the Subaccord", async () => {
    if (!env.up) return; // offline CI lane

    const nonce = 3n;
    const payload: UpdatePayload = { __kind: "AlphaBps", fields: [1_500] };
    const { instruction: proposeIx, pendingUpdate } = await proposeCourtUpdate(
      { caller: authority, list, subaccord },
      { nonce, payload },
      CANON_PROGRAM_ID,
    );
    await env.sendIx(proposeIx);

    // The PendingUpdate landed; the CanonList PDA (not the wallet) signed as
    // the Subaccord authority, and the 48h timelock is armed.
    const pu = (await fetchDecoded(env, pendingUpdate, getPendingUpdateDecoder()))!;
    expect(pu.proposed.__kind).toBe("AlphaBps");
    expect(pu.proposedBy).toBe(list);
    const executeAfterSlot = pu.executeAfterSlot;

    // Execute BEFORE the timelock: permissionless but must revert.
    const execBefore = executeSubaccordUpdate(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      subaccord,
      pendingUpdate,
    );
    await expect(env.sendIx(execBefore)).rejects.toThrow();
    expect(
      (await fetchDecoded(env, subaccord, getSubaccordDecoder()))!.alphaBps,
    ).toBe(1_000); // canonical default — unchanged

    // Advance past the deadline (surfpool wraps slots at slotsInEpoch, hence
    // the direct Clock-sysvar overwrite) and execute again.
    await warpForwardSlots(env, UPDATE_TIMELOCK_SLOTS);
    await setClockSlot(env, executeAfterSlot);
    await env.sendIx(
      executeSubaccordUpdate(
        env.accord.adapter,
        env.programId,
        env.payer.address,
        subaccord,
        pendingUpdate,
      ),
    );

    // The court param actually changed.
    expect(
      (await fetchDecoded(env, subaccord, getSubaccordDecoder()))!.alphaBps,
    ).toBe(1_500);
  }, 120_000);

  it("propose_court_update: Authority payload variant is rejected (ForbiddenPayload)", async () => {
    if (!env.up) return; // offline CI lane

    const nonce = 5n;
    const { instruction, pendingUpdate } = await proposeCourtUpdate(
      { caller: authority, list, subaccord },
      { nonce, payload: { __kind: "Authority", fields: [env.payer.address] } },
      CANON_PROGRAM_ID,
    );
    await expect(env.sendIx(instruction)).rejects.toThrow();

    // Nothing landed: no PendingUpdate at the nonce.
    expect(
      await fetchDecoded(env, pendingUpdate, getPendingUpdateDecoder()),
    ).toBeNull();

    // The court authority is still the list PDA — pinned forever.
    expect(
      (await fetchDecoded(env, subaccord, getSubaccordDecoder()))!.authority,
    ).toBe(list);
  }, 120_000);
});
