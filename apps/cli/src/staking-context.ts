/**
 * Intra-topic helpers for `staking:*` — account resolution + MST proof
 * resolution shared by stake / request-withdraw / withdraw / reconcile /
 * withdraw-fees. NOT an oclif command (no default Command export) so it is
 * invisible to `useaccord manifest`.
 *
 * Two responsibilities:
 *   - {@link resolveStaking} — fetch the Subaccord + derive every PDA / ATA the
 *     staking instructions need (jurorStake, juror ATA, stake_vault ATA,
 *     pause-state singleton).
 *   - {@link resolveProof} — build the MST accumulator proof either auto
 *     (fetch all JurorStakes → `prepareStakeProof`) or manual (`--path-from`).
 *
 * ATA derivation mirrors the on-chain `create_associated_token_account`
 * layout: `ATA_PROGRAM ‖ [owner, TOKEN_PROGRAM, mint]` (ADR-0020).
 */
import { readFileSync } from "node:fs";

import { getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";

import {
  findJurorStakePda,
  findJurorStakesBySubaccord,
  findPauseStatePda,
  fetchMaybeSubaccord,
  prepareStakeProof,
  type MSTNode,
  type Subaccord,
  type SubaccordAccumulatorView,
  type JurorStakeLeaf,
} from "@useaccord/sdk";

import type { ChainContext } from "./lib/base-command.js";

/** SPL Token program. */
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
/** SPL Associated Token Account program. */
const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/** Derive the canonical ATA for (mint, owner) the way the program does. */
export async function associatedTokenAddress(mint: Address, owner: Address): Promise<Address> {
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

/** Everything a staking instruction needs after the Subaccord is fetched. */
export interface ResolvedStaking {
  subaccord: Address;
  sub: Subaccord;
  juror: Address;
  jurorStake: Address;
  stakingToken: Address;
  feeToken: Address;
  jurorTokenAccount: Address;
  stakeVault: Address;
  pauseState: Address;
}

/**
 * Fetch the Subaccord + derive every shared account. Throws a clear
 * `SubaccordNotFound` if it doesn't exist (the CLI maps this via `catch()`).
 */
export async function resolveStaking(
  ctx: ChainContext,
  subaccordAddr: Address,
  juror: Address,
  opts: { pauseState?: Address } = {},
): Promise<ResolvedStaking> {
  const maybe = await fetchMaybeSubaccord(ctx.accord.rpc, subaccordAddr);
  if (!maybe.exists) {
    throw new Error(`SubaccordNotFound: ${subaccordAddr} does not exist`);
  }
  const sub = maybe.data;

  const jurorStakePda = await findJurorStakePda({ subaccord: subaccordAddr, juror });
  const jurorAta = await associatedTokenAddress(sub.stakingToken, juror);
  const stakeVault = await associatedTokenAddress(sub.stakingToken, subaccordAddr);
  const pauseStatePda = await findPauseStatePda();
  const pauseState = opts.pauseState ?? pauseStatePda[0];

  return {
    subaccord: subaccordAddr,
    sub,
    juror,
    jurorStake: jurorStakePda[0],
    stakingToken: sub.stakingToken,
    feeToken: sub.feeToken,
    jurorTokenAccount: jurorAta,
    stakeVault,
    pauseState,
  };
}

/**
 * Shared `StakingAccounts` shape (juror / subaccord / jurorStake / token /
 * ATAs / pauseState). Withdraw omits pauseState; the adapter ignores it there.
 */
export function stakingAccounts(r: ResolvedStaking) {
  return {
    juror: r.juror,
    subaccord: r.subaccord,
    pauseState: r.pauseState,
    jurorStake: r.jurorStake,
    stakingToken: r.stakingToken,
    jurorTokenAccount: r.jurorTokenAccount,
    stakeVault: r.stakeVault,
  };
}

/**
 * Build the MST accumulator proof for stake / requestWithdraw / reconcileStake
 * (AUTO mode). Fetches all JurorStakes for the Subaccord + the on-chain
 * accumulator view, then `prepareStakeProof`. A root mismatch means stale data
 * → throws `AccumulatorRootMismatch` (surfaced with a retry hint).
 *
 * For MANUAL mode (`--path-from`), call {@link readProofFile} directly — it is
 * pure and should run BEFORE chain access so a bad file fails fast.
 */
export async function resolveProof(
  ctx: ChainContext,
  r: ResolvedStaking,
): Promise<{ path: MSTNode[]; index: number }> {
  const view: SubaccordAccumulatorView = {
    rootHash: new Uint8Array(r.sub.rootHash),
    nextIndex: r.sub.nextIndex,
    depth: r.sub.depth,
  };
  const accounts = await findJurorStakesBySubaccord(ctx.accord.rpc, r.subaccord);
  const leaves: JurorStakeLeaf[] = accounts.map((a) => ({
    juror: a.data.juror,
    staked: a.data.staked,
    treeIndex: a.data.treeIndex,
  }));
  const result = await prepareStakeProof(view, leaves, r.juror);
  return { path: result.path, index: result.index };
}

/**
 * Read a manual MST proof from a JSON file (MANUAL mode). Accepts
 * `{path: [...]}` or a bare `[...]`; each node `{siblingHash, siblingSum}`.
 * Round-trips `accumulator:prepare-stake-proof` output. Pure — no chain.
 */
export function readProofFile(file: string): MSTNode[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch (e) {
    throw new Error(`CannotReadProofFile: ${file} — ${e instanceof Error ? e.message : String(e)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `InvalidProofFile: ${file} is not valid JSON — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const arr = (Array.isArray(parsed) ? parsed : (parsed as { path?: unknown }).path) as unknown;
  if (!Array.isArray(arr)) {
    throw new Error(
      `InvalidProofFile: ${file} — expected a \`path\` array of {siblingHash, siblingSum}`,
    );
  }
  return arr.map((node, i) => {
    const n = node as { siblingHash?: string; siblingSum?: string | number };
    if (typeof n.siblingHash !== "string") {
      throw new Error(`InvalidProofFile: ${file} node[${i}].siblingHash must be hex`);
    }
    return {
      siblingHash: hexToBytes(n.siblingHash),
      siblingSum: BigInt(n.siblingSum ?? 0),
    };
  });
}

/** `<hex>` (any case, optional `0x`) → Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`InvalidHexLength: ${hex}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
