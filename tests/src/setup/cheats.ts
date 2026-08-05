// cheats.ts — Surfpool `surfnet_*` cheatcode wrappers.
//
// The Accord program's time-gated paths (commit/reveal/finalize windows, the
// 1-day snapshot challenge, the 3-day appeal window) read `Clock::unix_timestamp`;
// its timelocks (propose/execute update, propose/execute unpause) read
// `Clock::slot`. Surfpool advances these only with real time, so we drive them
// via `surfnet_timeTravel`. VRF injection + token setup use `surfnet_setAccount`
// / `surfnet_setTokenAccount`.
//
// IMPORTANT: time-warp is GLOBAL on the surfnet, so the e2e suite MUST run
// serially (jest `maxWorkers: 1`). Every warp here is computed from the LIVE
// clock, so specs are robust to whatever "now" a prior spec left behind.

import type { Address } from "@solana/kit";
import type { TestEnv } from "./env.js";

/** Solana Clock sysvar (`SysvarClock1111...`). */
const CLOCK_SYSVAR =
  "SysvarC1ock11111111111111111111111111111111" as Address;

/** Layout: slot u64@0, epoch_start_timestamp i64@8, epoch u64@16, leader u64@24, unix_timestamp i64@32. */
export interface ClockView {
  slot: bigint;
  unixTimestamp: bigint;
}

/** Raw cheatcode call — POSTs a `surfnet_*` JSON-RPC method to the surfnet. */
export async function cheat<T = unknown>(
  env: TestEnv,
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(env.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const { result, error } = (await res.json()) as {
    result?: T;
    error?: { message: string; data?: unknown };
  };
  if (error) {
    throw new Error(`cheat ${method} failed: ${error.message}`);
  }
  return result as T;
}

/** Read the live Clock sysvar (slot + unix_timestamp). */
export async function readClock(env: TestEnv): Promise<ClockView> {
  const account = await env.rpc
    .getAccountInfo(CLOCK_SYSVAR, { encoding: "base64" })
    .send();
  if (!account.value) {
    throw new Error("Clock sysvar not readable — is this a Surfpool surfnet?");
  }
  const bytes = Buffer.from(account.value.data[0], "base64");
  return {
    slot: bytes.readBigUInt64LE(0),
    unixTimestamp: bytes.readBigInt64LE(32),
  };
}

/**
 * Overwrite the Clock sysvar's slot and/or unix_timestamp in-place. Surfpool's
 * `surfnet_timeTravel` wraps the slot at `slotsInEpoch` (432000) on a fork, so
 * for deterministic large warps (esp. UPDATE_TIMELOCK_SLOTS) we set the field
 * directly — Surfpool honours the overwritten Clock for `Clock::get()`. Only
 * the given fields are mutated; the rest of the 40-byte sysvar is preserved.
 */
export async function setClock(
  env: TestEnv,
  fields: { slot?: bigint; unixTimestamp?: bigint },
): Promise<ClockView> {
  const account = await env.rpc
    .getAccountInfo(CLOCK_SYSVAR, { encoding: "base64" })
    .send();
  if (!account.value) {
    throw new Error("Clock sysvar not readable — is this a Surfpool surfnet?");
  }
  const bytes = Buffer.from(account.value.data[0], "base64");
  if (fields.slot !== undefined) bytes.writeBigUInt64LE(fields.slot, 0);
  if (fields.unixTimestamp !== undefined) {
    bytes.writeBigInt64LE(fields.unixTimestamp, 32);
  }
  await setAccountRaw(env, CLOCK_SYSVAR, {
    lamports: account.value.lamports,
    data: new Uint8Array(bytes),
    owner: account.value.owner,
    executable: false,
  });
  return readClock(env);
}

/**
 * Advance `Clock::unix_timestamp` by `seconds` (window gates: commit/reveal/
 * snapshot-challenge/appeal). Uses `surfnet_timeTravel` — surfpool re-derives
 * the timestamp per block, so a sysvar byte-overwrite would be ephemeral; the
 * cheatcode advances surfpool's internal clock persistently. (Slot warps use
 * `setClock` instead — see {@link warpForwardSlots} — because timeTravel wraps
 * the slot at `slotsInEpoch`.)
 */
export async function warpForwardSeconds(
  env: TestEnv,
  seconds: number | bigint,
): Promise<ClockView> {
  const now = await readClock(env);
  const targetMs = now.unixTimestamp * 1000n + BigInt(seconds) * 1000n;
  await cheat(env, "surfnet_timeTravel", [{ absoluteTimestamp: Number(targetMs) }]);
  return readClock(env);
}

/** Advance `Clock::slot` by `slots` (timelock gates: update / unpause). */
export async function warpForwardSlots(
  env: TestEnv,
  slots: number | bigint,
): Promise<ClockView> {
  const now = await readClock(env);
  return setClock(env, { slot: now.slot + BigInt(slots) });
}

/** Replace an account's full on-chain state (raw bytes → hex data + owner/lamports). */
export async function setAccountRaw(
  env: TestEnv,
  address: Address,
  account: {
    lamports: number | bigint;
    data: Uint8Array | string; // bytes or base64
    owner: Address;
    executable?: boolean;
    rentEpoch?: number | bigint;
  },
): Promise<void> {
  // surfnet_setAccount expects `data` as a HEX string (surfpool 1.5.0).
  const data =
    typeof account.data === "string"
      ? account.data // assumed already hex
      : Buffer.from(account.data).toString("hex");
  await cheat(env, "surfnet_setAccount", [
    address,
    {
      lamports: Number(account.lamports),
      data,
      owner: account.owner,
      executable: account.executable ?? false,
      rentEpoch: Number(account.rentEpoch ?? 0),
    },
  ]);
}
