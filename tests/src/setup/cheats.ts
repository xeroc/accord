// cheats.ts — Surfpool `surfnet_*` cheatcode wrappers.
//
// The Accord program's time-gated paths (commit/reveal/finalize windows, the
// 1-day snapshot challenge, the 3-day appeal window) read `Clock::unix_timestamp`;
// its timelocks (propose/execute update, propose/execute unpause) read
// `Clock::slot`. Surfpool advances these only with real time, so we drive them
// via `surfnet_timeTravel` (REQUIRES surfpool >= 1.7.0: exact `absoluteSlot`
// landings; sysvar `surfnet_setAccount` is rejected as managed — surfpool#895).
// VRF injection + token setup use `surfnet_setAccount`
// / `surfnet_setTokenAccount` — never on sysvars.
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
    // surfpool buries the actionable reason in `data` while `message` is a
    // generic "Internal error" (e.g. managed-sysvar rejections, past-slot
    // travel) — surface both or the failure is undiagnosable (surfpool#895).
    const why =
      error.data === undefined ? "" : ` — ${JSON.stringify(error.data)}`;
    throw new Error(`cheat ${method} failed: ${error.message}${why}`);
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
 * Advance `Clock::unix_timestamp` by `seconds` (window gates: commit/reveal/
 * snapshot-challenge/appeal). Uses `surfnet_timeTravel` — surfpool re-derives
 * the timestamp per block, so a sysvar byte-overwrite would be ephemeral; the
 * cheatcode advances surfpool's internal clock persistently.
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

/**
 * Jump `Clock::slot` to an absolute slot (timelock deadlines: propose/execute
 * update, unpause). `surfnet_timeTravel { absoluteSlot }` lands exactly and
 * recomputes epoch/leader fields — on surfpool >= 1.7.0, which this suite
 * REQUIRES: pre-1.7 `absoluteSlot` wrapped modulo `slotsInEpoch` (which is why
 * this used to be a raw Clock-sysvar `surfnet_setAccount`), and since 1.7.0
 * sysvar writes are rejected outright (managed sysvars — surfpool#895).
 */
export async function warpToSlot(
  env: TestEnv,
  slot: bigint,
): Promise<ClockView> {
  const n = BigInt(slot);
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`slot out of JSON-safe range: ${n}`);
  }
  await cheat(env, "surfnet_timeTravel", [{ absoluteSlot: Number(n) }]);
  return readClock(env);
}

/** Advance `Clock::slot` by `slots` (timelock gates: update / unpause). */
export async function warpForwardSlots(
  env: TestEnv,
  slots: number | bigint,
): Promise<ClockView> {
  const now = await readClock(env);
  return warpToSlot(env, now.slot + BigInt(slots));
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
