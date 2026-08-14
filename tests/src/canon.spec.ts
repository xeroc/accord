// canon.spec.ts — Canon curated-list lifecycle against Surfpool.
//
// Drives the non-dispute lifecycle via the @useaccord/canon SDK:
//   submit_item → advance_pending → request_withdrawal → advance_withdrawal
//
// `create_list` is not yet shipped on-chain (bean accord-73yx), so the
// CanonList account is fabricated directly via `surfnet_setAccount` using the
// SDK's own encoder — same approach as the Rust LiteSVM tests. The
// challenge_item / settle_item dispute path requires a backing Subaccord +
// Accord create_dispute CPI integration and will be covered when create_list
// ships (it creates the Subaccord).
//
// See AGENTS.md "e2e suite — tests/src" for harness conventions.
import {
  CANON_PROGRAM_ID,
  findCanonListPda,
  findCanonItemPda,
  submitItem,
  advancePending,
  requestWithdrawal,
  advanceWithdrawal,
  getCanonListEncoder,
  getCanonItemDecoder,
  ItemState,
  type CanonListArgs,
} from "@useaccord/canon";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  generateKeyPairSigner,
  type Address,
} from "@solana/kit";

import { createTestEnv, type TestEnv } from "./setup/env.js";
import {
  setAccountRaw,
  warpForwardSeconds,
  readClock,
} from "./setup/cheats.js";
import {
  createMint,
  setTokenBalance,
  TOKEN_PROGRAM_ID,
} from "./setup/tokens.js";
import { fetchDecoded } from "./setup/assertions.js";

/** SPL Associated Token Account program. */
const ATA_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/** Solana `Pubkey::default()` — sentinel for list_program (ownership check off). */
const DEFAULT_PUBKEY = "11111111111111111111111111111111" as Address;

const SUBMIT_DEPOSIT = 500n;
const LISTING_WINDOW = 5n * 24n * 60n * 60n; // 5 days (SPEC default)
const WITHDRAWAL_TIMELOCK = 5n * 24n * 60n * 60n; // 5 days

/** Derive the canonical ATA for (mint, owner) via the ATA program. */
async function ata(mint: Address, owner: Address): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM_ID,
    seeds: [
      new Uint8Array(enc.encode(owner)),
      new Uint8Array(enc.encode(TOKEN_PROGRAM_ID)),
      new Uint8Array(enc.encode(mint)),
    ],
  });
  return addr;
}

/**
 * Fabricate a CanonList account directly (create_list not yet shipped, bean
 * accord-73yx). Uses the SDK's generated encoder so the byte layout matches
 * the on-chain struct exactly. Mirrors the Rust LiteSVM test fabrication.
 */
async function fabricateCanonList(
  env: TestEnv,
  params: {
    creator: Address;
    rulesHash: Uint8Array;
    feeMint: Address;
  },
): Promise<Address> {
  const [listAddr, listBump] = await findCanonListPda({
    creator: params.creator,
    rulesHash: params.rulesHash,
  });

  const args: CanonListArgs = {
    creator: params.creator,
    stakeMint: params.feeMint,
    feeMint: params.feeMint,
    listProgram: DEFAULT_PUBKEY, // sentinel: ownership check disabled
    rulesHash: params.rulesHash,
    subaccord: DEFAULT_PUBKEY, // no backing Subaccord yet (create_list not built)
    submitDeposit: SUBMIT_DEPOSIT,
    challengePct: 5_000, // 50%
    listingWindow: LISTING_WINDOW,
    withdrawalTimelock: WITHDRAWAL_TIMELOCK,
    authority: listAddr,
    itemCount: 0,
    bump: listBump,
  };

  const data = new Uint8Array(getCanonListEncoder().encode(args));
  await setAccountRaw(env, listAddr, {
    lamports: 1_000_000_000, // well over rent
    data,
    owner: CANON_PROGRAM_ID,
  });
  return listAddr;
}

describe("Canon lifecycle (Surfpool)", () => {
  let env: TestEnv;
  let mint: Address;
  let listPda: Address;
  let rulesHash: Uint8Array;
  let curatedAccount: Address;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return; // offline CI lane

    // Check the Canon program is deployed.
    const canonAccount = await env.rpc.getAccountInfo(CANON_PROGRAM_ID).send();
    if (!canonAccount.value) {
      throw new Error(
        "Canon program not deployed — restart Surfpool with `make run_surfpool` " +
          "(the deployment runbook now deploys both accord + canon).",
      );
    }

    // Set up the fee mint + fund the payer's ATA.
    const created = await createMint(env, 6);
    mint = created.mint;
    const payerAta = await ata(mint, env.payer.address);
    await setTokenBalance(env, env.payer.address, mint, 1_000_000n);

    // Fabricate the CanonList.
    rulesHash = crypto.getRandomValues(new Uint8Array(32));
    listPda = await fabricateCanonList(env, {
      creator: env.payer.address,
      rulesHash,
      feeMint: mint,
    });

    // A curated account (arbitrary address — sentinel disables ownership check).
    curatedAccount = (await generateKeyPairSigner()).address;
  }, 60_000);

  test("submit_item: locks deposit, creates CanonItem in Pending", async () => {
    if (!env.up) return;
    const vault = await ata(mint, listPda);
    const payerAta = await ata(mint, env.payer.address);

    const { instruction, item: itemPda } = await submitItem(
      {
        submitter: env.payer,
        list: listPda,
        account: curatedAccount,
        feeMint: mint,
        submitterTokenAccount: payerAta,
        vault,
      },
      {
        evidence: crypto.getRandomValues(new Uint8Array(32)),
        deposit: SUBMIT_DEPOSIT,
      },
    );
    await env.sendIx(instruction);

    // Verify the item was created in Pending.
    const item = await fetchDecoded(env, itemPda, getCanonItemDecoder());
    expect(item).not.toBeNull();
    expect(item!.state).toBe(ItemState.Pending);
    expect(item!.accumulatedStake).toBe(SUBMIT_DEPOSIT);
    expect(item!.submitter).toBe(env.payer.address);
    expect(item!.account).toBe(curatedAccount);
  });

  test("advance_pending: Pending → Listed after listing_window", async () => {
    if (!env.up) return;
    const [itemPda] = await findCanonItemPda(listPda, curatedAccount);

    // Warp past the listing window.
    await warpForwardSeconds(env, Number(LISTING_WINDOW) + 10);

    const instruction = advancePending({
      caller: env.payer,
      list: listPda,
      item: itemPda,
    });
    await env.sendIx(instruction);

    const item = await fetchDecoded(env, itemPda, getCanonItemDecoder());
    expect(item).not.toBeNull();
    expect(item!.state).toBe(ItemState.Listed);
  });

  test("request_withdrawal: Listed → WithdrawPending", async () => {
    if (!env.up) return;
    const [itemPda] = await findCanonItemPda(listPda, curatedAccount);

    const instruction = requestWithdrawal({
      submitter: env.payer,
      list: listPda,
      item: itemPda,
    });
    await env.sendIx(instruction);

    const item = await fetchDecoded(env, itemPda, getCanonItemDecoder());
    expect(item).not.toBeNull();
    expect(item!.state).toBe(ItemState.WithdrawPending);
    expect(item!.withdrawalRequestedAt).not.toBeNull();
  });

  test("advance_withdrawal: WithdrawPending → Removed, stake returned", async () => {
    if (!env.up) return;
    const [itemPda] = await findCanonItemPda(listPda, curatedAccount);
    const vault = await ata(mint, listPda);
    const submitterAta = await ata(mint, env.payer.address);

    // Warp past the withdrawal timelock.
    await warpForwardSeconds(env, Number(WITHDRAWAL_TIMELOCK) + 10);

    // Read vault balance before withdrawal.
    const vaultAcctBefore = await env.rpc
      .getAccountInfo(vault, { encoding: "base64" })
      .send();
    const vaultBalanceBefore = vaultAcctBefore.value
      ? Number(
          Buffer.from(vaultAcctBefore.value.data[0]!, "base64").readBigUInt64LE(
            64,
          ),
        )
      : 0;

    const instruction = advanceWithdrawal({
      caller: env.payer,
      list: listPda,
      item: itemPda,
      feeMint: mint,
      submitterTokenAccount: submitterAta,
      vault,
    });
    await env.sendIx(instruction);

    // Item is Removed.
    const item = await fetchDecoded(env, itemPda, getCanonItemDecoder());
    expect(item).not.toBeNull();
    expect(item!.state).toBe(ItemState.Removed);
    expect(item!.accumulatedStake).toBe(0n);
  });
});
