// staking.spec.ts — Juror capital stake / unstake against Surfpool (port of
// programs/accord/tests/stake_litesvm.rs).
//
// Coverage (per the assignment):
//  - happy stake  : SPL-transfer into the vault + JurorStake.amount credited
//  - happy unstake: full unstake drains JurorStake.amount to 0
//  - invalid amount (0) revert (SDK `InvalidAmount` guard, mirrors on-chain)
//  - over-balance unstake reverts on-chain (InsufficientBalance)
//  - canUnstake active_draws>0 guard (pure unit cases + on-chain StakeLocked)
//
// Multi-signer note: the SDK adapter pins `juror = accord.signer`, so each
// juror gets its own `new Accord({ endpoint, signer: jurorKp })` facade; the
// built instruction carries the juror signer, and `env.sendIx` signs with both
// the fee payer + the juror (Kit `signTransactionMessageWithSigners` signs every
// signer referenced by the message). The juror — not the fee payer — funds the
// `init_if_needed` rent for JurorStake + the vault ATA (lib.rs:1728-1752), so it
// is airdropped SOL up front via the shared `fundSigner`.
//
// Singleton note: PauseState is a program-wide singleton; `initializePause` is
// only sent when it does not already exist on this Surfnet, so the suite is
// re-runnable within one session and coexists with the sibling dispute spec.
import {
  Accord,
  stake,
  unstake,
  canUnstake,
  initializePause,
  createSubaccord,
  getJurorStakeDecoder,
  type StakingAccounts,
  type JurorStakeView,
} from "@accord/sdk";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  type Address,
} from "@solana/kit";

import { createTestEnv, fundSigner, type TestEnv } from "./setup/env.js";
import { setAccountRaw } from "./setup/cheats.js";
import { createMint, setTokenBalance, TOKEN_PROGRAM_ID } from "./setup/tokens.js";
import { defaultSubaccordArgs } from "./setup/fixtures.js";
import { fetchDecoded } from "./setup/assertions.js";

/** SPL Associated Token Account program (`ATokenGPvbd…`). */
const ATA_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/** JurorStake PDA seed prefix (state.rs: SEED_JUROR_STAKE = b"stake"). */
const SEED_JUROR_STAKE = new Uint8Array([115, 116, 97, 107, 101]); // "stake"

const FEE_PER_JUROR = 1_000_000n;
const MIN_STAKE = 1_000n;
const STAKE_FUND = 10_000n; // juror ATA balance before staking
const STAKE_AMT = 5_000n;

/** Derive the canonical ATA for (mint, owner) the way the program does. */
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

/** Derive the JurorStake PDA (`["stake", subaccord, juror]`). */
async function jurorStakePda(
  programId: Address,
  subaccord: Address,
  juror: Address,
): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      SEED_JUROR_STAKE,
      new Uint8Array(enc.encode(subaccord)),
      new Uint8Array(enc.encode(juror)),
    ],
  });
  return addr;
}

/** Read an SPL token account amount (u64 LE @ offset 64). */
async function readTokenAmount(
  env: TestEnv,
  account: Address,
): Promise<bigint> {
  const res = await env.rpc
    .getAccountInfo(account, { encoding: "base64" })
    .send();
  if (!res.value) return 0n;
  const b = Buffer.from(res.value.data[0], "base64");
  return b.readBigUInt64LE(64);
}

describe("e2e: staking (requires Surfpool)", () => {
  let env: TestEnv;
  let mint!: Address;
  let subaccord!: Address;
  let vault!: Address;
  let pauseState!: Address;

  beforeAll(async () => {
    env = await createTestEnv();
    if (!env.up) return;

    // 1) Pause singleton (idempotent: skip init if it already exists on this
    //    Surfnet — stake reverts while paused, so it must be present + unpaused).
    const pause = await initializePause(
      env.accord.adapter,
      env.programId,
      env.payer.address,
    );
    pauseState = pause.pauseState;
    const existing = await env.rpc
      .getAccountInfo(pauseState, { encoding: "base64" })
      .send();
    if (!existing.value) await env.sendIx(pause.instruction);

    // 2) Fresh staking-token mint.
    mint = (await createMint(env, 6)).mint;

    // 3) A Subaccord over `mint`. feePerJuror is irrelevant to staking but set
    //    to a non-zero default to mirror the dispute spec's economics.
    const args = defaultSubaccordArgs(mint, env.payer.address, {
      feePerJuror: FEE_PER_JUROR,
      minStake: MIN_STAKE,
    });
    const sub = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    subaccord = sub.subaccord;
    await env.sendIx(sub.instruction);

    // 4) Vault ATA = associated(mint, subaccordPda) — derived the same way the
    //    program / LiteSVM `vault_ata()` does. Lazily created on first stake.
    vault = await ata(mint, subaccord);
  }, 120_000);

  /** Fresh funded juror + its staking ATA + a per-juror Accord facade. */
  async function armJuror() {
    const juror = await fundSigner(env);
    await setTokenBalance(env, juror.address, mint, STAKE_FUND);
    const jurorAta = await ata(mint, juror.address);
    const jurorStake = await jurorStakePda(
      env.programId,
      subaccord,
      juror.address,
    );
    const accounts: StakingAccounts = {
      juror: juror.address,
      subaccord,
      pauseState,
      jurorStake,
      stakingToken: mint,
      jurorTokenAccount: jurorAta,
      vault,
    };
    const facade = new Accord({ endpoint: env.rpcUrl, signer: juror });
    return { juror, jurorAta, jurorStake, accounts, facade };
  }

  /** Decode the JurorStake at `pda` (account exists post-stake). */
  const readStake = (pda: Address) =>
    fetchDecoded(env, pda, getJurorStakeDecoder());

  it("happy stake moves tokens into the vault + credits JurorStake.amount", async () => {
    if (!env.up) return;
    const { jurorStake, accounts, facade } = await armJuror();

    await env.sendIx(stake(facade.adapter, env.programId, accounts, STAKE_AMT));

    // vault gained the stake; juror ATA lost it.
    expect(await readTokenAmount(env, vault)).toBe(STAKE_AMT);
    expect(await readTokenAmount(env, accounts.jurorTokenAccount)).toBe(
      STAKE_FUND - STAKE_AMT,
    );

    const js = await readStake(jurorStake);
    expect(js).not.toBeNull();
    expect(js!.amount).toBe(STAKE_AMT);
    expect(js!.subaccord).toBe(subaccord);
    expect(js!.juror).toBe(accounts.juror);
    expect(js!.activeDraws).toBe(0);
    expect(js!.bump).toBeGreaterThan(0);
  }, 60_000);

  it("happy unstake drains the full stake (amount → 0)", async () => {
    if (!env.up) return;
    const { jurorStake, jurorAta, accounts, facade } = await armJuror();

    await env.sendIx(stake(facade.adapter, env.programId, accounts, STAKE_AMT));
    let js = await readStake(jurorStake);
    expect(js!.amount).toBe(STAKE_AMT);

    // Full unstake. The facade's `unstake` would fetch JurorStake via the broken
    // typed fetcher, so pass a pre-fetched JurorStakeView to skip the fetch.
    const view: JurorStakeView = {
      juror: js!.juror,
      amount: js!.amount,
      activeDraws: js!.activeDraws,
    };
    const ix = await unstake(
      facade.adapter,
      env.programId,
      accounts,
      STAKE_AMT,
      view,
    );
    await env.sendIx(ix);

    js = await readStake(jurorStake);
    expect(js!.amount).toBe(0n);
    // capital returned to the juror ATA
    expect(await readTokenAmount(env, jurorAta)).toBe(STAKE_FUND);
  }, 60_000);

  it("stake with amount 0 is rejected (InvalidAmount)", async () => {
    if (!env.up) return;
    const { accounts, facade } = await armJuror();
    // The SDK surfaces the on-chain `InvalidAmount` require as a typed client
    // guard before building the instruction (lib.rs:208).
    expect(() => stake(facade.adapter, env.programId, accounts, 0n)).toThrow(
      /InvalidAmount/,
    );
  }, 60_000);

  it("unstake over balance reverts on-chain (InsufficientBalance)", async () => {
    if (!env.up) return;
    const { jurorStake, accounts, facade } = await armJuror();
    await env.sendIx(stake(facade.adapter, env.programId, accounts, STAKE_AMT));
    expect((await readStake(jurorStake))!.amount).toBe(STAKE_AMT);

    // Bypass the facade's `assertCanUnstake` pre-check to exercise the on-chain
    // `InsufficientBalance` require (lib.rs:276-278).
    const ix = facade.adapter.buildUnstake({
      programId: env.programId,
      accounts,
      amount: STAKE_AMT + 1n,
    });
    await expect(env.sendIx(ix)).rejects.toThrow();

    // stake untouched on revert
    expect((await readStake(jurorStake))!.amount).toBe(STAKE_AMT);
  }, 60_000);

  it("unstake while active_draws>0 reverts on-chain (StakeLocked)", async () => {
    if (!env.up) return;
    const { jurorStake, accounts, facade } = await armJuror();
    await env.sendIx(stake(facade.adapter, env.programId, accounts, STAKE_AMT));

    // Simulate the juror being drawn into a live dispute by mutating
    // `active_draws` directly on the JurorStake PDA (the LiteSVM test does the
    // same via `set_account`). Layout: disc(8) subaccord(32) juror(32) amount(8)
    // active_draws(u32 LE @ offset 80).
    const acc = await env.rpc
      .getAccountInfo(jurorStake, { encoding: "base64" })
      .send();
    const raw = Buffer.from(acc.value!.data[0], "base64");
    raw.writeUInt32LE(2, 80);
    await setAccountRaw(env, jurorStake, {
      lamports: acc.value!.lamports,
      data: new Uint8Array(raw),
      owner: env.programId,
    });

    // Bypass the facade's StakeLocked pre-check → on-chain require fires.
    const ix = facade.adapter.buildUnstake({
      programId: env.programId,
      accounts,
      amount: STAKE_AMT,
    });
    await expect(env.sendIx(ix)).rejects.toThrow();
  }, 60_000);
});

describe("canUnstake guard (pure, no chain)", () => {
  const view = (over: Partial<{ amount: bigint; activeDraws: number }> = {}) => ({
    juror: "11111111111111111111111111111111" as Address,
    amount: 1_000n,
    activeDraws: 0,
    ...over,
  });

  it("rejects a zero / negative amount (InvalidAmount)", () => {
    expect(canUnstake(view(), 0n)).toEqual({ ok: false, reason: "InvalidAmount" });
  });

  it("rejects while the juror is drawn into a live dispute (StakeLocked)", () => {
    expect(canUnstake(view({ activeDraws: 1 }), 500n)).toEqual({
      ok: false,
      reason: "StakeLocked",
    });
  });

  it("rejects an amount exceeding the staked balance (InsufficientBalance)", () => {
    expect(canUnstake(view(), 2_000n)).toEqual({
      ok: false,
      reason: "InsufficientBalance",
    });
  });

  it("approves a valid unstake", () => {
    expect(canUnstake(view(), 500n)).toEqual({ ok: true });
    expect(canUnstake(view({ amount: 1_000n }), 1_000n)).toEqual({ ok: true });
  });
});
