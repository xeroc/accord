// canon.spec.ts — Canon curated-list lifecycle against Surfpool.
//
// Drives the non-dispute lifecycle via the @useaccord/canon SDK:
//   submit_item → advance_pending → request_withdrawal → advance_withdrawal
// then the delist ⇒ delete tail:
//   close_item (NotRemoved revert on Listed; Removed → rent to caller,
//   account closed) and re-submit after close (fresh item at the same seed).
// The final test covers the settle-remove terminal path: a challenged item
// whose dispute is forced terminal-Failed settles to Removed and is closed.
//
// `create_list` is not yet shipped on-chain (bean accord-73yx), so the
// CanonList account is fabricated directly via `surfnet_setAccount` using the
// SDK's own encoder — same approach as the Rust LiteSVM tests. (The settle
// test below uses the real `createList` CPI because it needs a backing
// Subaccord to file a dispute against.)
//
// See AGENTS.md "e2e suite — tests/src" for harness conventions.
import {
  CANON_PROGRAM_ID,
  ACCORD_PROGRAM_ID,
  findCanonListPda,
  findCanonItemPda,
  submitItem,
  advancePending,
  requestWithdrawal,
  advanceWithdrawal,
  closeItem,
  createList,
  defaultCourtParams,
  challengeItem,
  settleItem,
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

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
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
import { armCanonJurors, ensurePause, ataOf } from "./draw-harness.js";
import { forceDisputeOutcome } from "./synod-harness.js";

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
    disputeCount: 0n,
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

  test("close_item: reverts NotRemoved on a Listed item", async () => {
    if (!env.up) return;
    const [itemPda] = await findCanonItemPda(listPda, curatedAccount);

    await expect(
      env.sendIx(closeItem({ caller: env.payer, item: itemPda })),
    ).rejects.toThrow();

    // The revert left the item untouched.
    const item = await fetchDecoded(env, itemPda, getCanonItemDecoder());
    expect(item).not.toBeNull();
    expect(item!.state).toBe(ItemState.Listed);
    expect(item!.accumulatedStake).toBe(SUBMIT_DEPOSIT);
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

  test("close_item: Removed → account closed, rent lamports to the caller", async () => {
    if (!env.up) return;
    const [itemPda] = await findCanonItemPda(listPda, curatedAccount);

    // A funded third party closes the PDA; the tx fee is paid by env.payer,
    // so the caller's delta is exactly the item's rent-exempt lamports.
    const caller = await fundSigner(env);
    const acct = (await env.rpc.getAccountInfo(itemPda).send()).value;
    expect(acct).not.toBeNull();
    const rentLamports = acct!.lamports;
    const before = (await env.rpc.getBalance(caller.address).send()).value;

    await env.sendIx(closeItem({ caller, item: itemPda }));

    const after = (await env.rpc.getBalance(caller.address).send()).value;
    expect(after).toBe(before + rentLamports);

    // The PDA is gone — it no longer decodes and the account 404s.
    expect(await fetchDecoded(env, itemPda, getCanonItemDecoder())).toBeNull();
    expect((await env.rpc.getAccountInfo(itemPda).send()).value).toBeNull();
  });

  test("submit_item after close: fresh CanonItem at the same PDA", async () => {
    if (!env.up) return;
    const [itemPda] = await findCanonItemPda(listPda, curatedAccount);
    const vault = await ata(mint, listPda);
    const payerAta = await ata(mint, env.payer.address);

    // Re-submitting the same curated account re-opens the freed seed.
    const { instruction } = await submitItem(
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

    const item = await fetchDecoded(env, itemPda, getCanonItemDecoder());
    expect(item).not.toBeNull();
    expect(item!.state).toBe(ItemState.Pending);
    expect(item!.accumulatedStake).toBe(SUBMIT_DEPOSIT); // fresh deposit
    expect(item!.challengeCount).toBe(0); // protection resets by design
    expect(item!.submitter).toBe(env.payer.address);
  });

  test("settle-remove path: Failed dispute settle → Removed → close_item", async () => {
    if (!env.up) return;

    // --- self-contained list with a real backing Subaccord (dispute path) ---
    const accordState = await ensurePause(env);
    const { mint: settleMint } = await createMint(env, 6);
    const {
      instruction: createIx,
      list,
      subaccord,
    } = await createList(
      { creator: env.payer, stakeMint: settleMint, feeMint: settleMint },
      {
        listProgram: DEFAULT_PUBKEY, // sentinel ⇒ ownership off
        evidenceOperator: env.payer.address,
        rulesHash: crypto.getRandomValues(new Uint8Array(32)),
        submitDeposit: 500n,
        challengePct: 5_000, // 50%
        listingWindow: LISTING_WINDOW,
        withdrawalTimelock: WITHDRAWAL_TIMELOCK,
        court: defaultCourtParams(),
      },
      CANON_PROGRAM_ID,
    );
    await env.sendIx(createIx);

    // create_dispute's intake gate needs staker_count >= min_jury_size (3);
    // the dispute is forced terminal-Failed below, so arming is enough.
    await armCanonJurors(env, accordState, subaccord, settleMint, 8);

    const vault = await ataOf(settleMint, list);
    const submitter = await fundSigner(env);
    await setTokenBalance(env, submitter.address, settleMint, 10_000n);
    const submitterAta = await ataOf(settleMint, submitter.address);
    const settleCurated = (await generateKeyPairSigner()).address;
    const { instruction: submitIx, item } = await submitItem(
      {
        submitter,
        list,
        account: settleCurated,
        feeMint: settleMint,
        submitterTokenAccount: submitterAta,
        vault,
      },
      { evidence: crypto.getRandomValues(new Uint8Array(32)), deposit: 500n },
      CANON_PROGRAM_ID,
    );
    await env.sendIx(submitIx);

    // --- challenge (CPI create_dispute, filer = list PDA) → force Failed ---
    const challenger = await fundSigner(env);
    await setTokenBalance(env, challenger.address, settleMint, 100_000n);
    const challengerAta = await ataOf(settleMint, challenger.address);
    const [dispute] = await getProgramDerivedAddress({
      programAddress: ACCORD_PROGRAM_ID,
      seeds: [
        new TextEncoder().encode("dispute"),
        getAddressEncoder().encode(list),
        new Uint8Array(8), // nonce 0, little-endian
      ],
    });
    const accordFeeVault = await ataOf(settleMint, subaccord);
    await env.sendIx(
      challengeItem(
        {
          challenger,
          list,
          item,
          subaccord,
          feeMint: settleMint,
          challengerTokenAccount: challengerAta,
          vault,
        },
        { evidence: crypto.getRandomValues(new Uint8Array(32)) },
        {
          accordDispute: dispute,
          accordState,
          accordFeeVault,
          accordProgram: ACCORD_PROGRAM_ID,
        },
        CANON_PROGRAM_ID,
      ),
    );
    await forceDisputeOutcome(env, dispute, { state: "Failed" });

    // --- settle_item: no ruling ⇒ both parties refunded, item Removed ---
    await env.sendIx(
      settleItem(
        {
          caller: env.payer,
          list,
          item,
          dispute,
          feeMint: settleMint,
          vault,
          challengerTokenAccount: challengerAta,
          submitterTokenAccount: submitterAta,
        },
        CANON_PROGRAM_ID,
      ),
    );
    const removed = (await fetchDecoded(env, item, getCanonItemDecoder()))!;
    expect(removed.state).toBe(ItemState.Removed);
    expect(removed.accumulatedStake).toBe(0n);

    // --- close_item: rent to a third-party caller, account gone ---
    const caller = await fundSigner(env);
    const acct = (await env.rpc.getAccountInfo(item).send()).value;
    expect(acct).not.toBeNull();
    const rentLamports = acct!.lamports;
    const before = (await env.rpc.getBalance(caller.address).send()).value;

    await env.sendIx(closeItem({ caller, item }));

    const after = (await env.rpc.getBalance(caller.address).send()).value;
    expect(after).toBe(before + rentLamports);
    expect((await env.rpc.getAccountInfo(item).send()).value).toBeNull();
  }, 300_000);
});
