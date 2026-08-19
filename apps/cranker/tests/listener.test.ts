/**
 * listener.test.ts — self-checks for the WS account listener (bean
 * accord-gbxm; parameterized for arbitrary programs/filters in accord-m5fd).
 *
 * Pins the three things the live loop depends on:
 *   - the default discriminator filter is built from the generated Dispute
 *     discriminator (so the subscription only delivers Dispute accounts);
 *   - caller-supplied filters (canon GC: discriminator + Removed state) are
 *     forwarded verbatim to `programNotifications`;
 *   - the listener fires one `onAccount` per account notification and is
 *     start/stop-safe.
 * The real reconnect loop is exercised end-to-end by the reconciler e2e suite
 * (Surfpool); here we drive it with a fake subscription stream and await the
 * target calls directly (no wall-clock timers).
 */
import { test, expect } from "bun:test";
import {
  getBase64Encoder,
  type Address,
  type GetProgramAccountsMemcmpFilter,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { DISPUTE_DISCRIMINATOR } from "@useaccord/sdk";
import { ItemState } from "@useaccord/canon";
import { canonItemStateFilter, removedCanonItemFilters } from "../src/canon-gc";
import { DISPUTE_FILTER_BYTES, DISPUTE_FILTERS, ProgramAccountListener } from "../src/listener";

const PROGRAM_ID = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed" as Address;
const CANON_PROGRAM = "can5ZhfgQpi7jymkxE7uEv4ZVm3X2f51KThTUtdWrFs" as Address;
const DISPUTE_A = "DisputeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const DISPUTE_B = "DisputeBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as Address;

test("DISPUTE_FILTER_BYTES is the base64 of the generated Dispute discriminator", () => {
  // Round-trip: the filter bytes decode back to exactly DISPUTE_DISCRIMINATOR.
  expect(Array.from(getBase64Encoder().encode(DISPUTE_FILTER_BYTES))).toEqual(
    Array.from(DISPUTE_DISCRIMINATOR),
  );
});

/** Fake subs that capture the subscription config and yield two notifications. */
function fakeSubs(notifications: Address[]) {
  let seenConfig: { filters?: readonly GetProgramAccountsMemcmpFilter[] } | undefined;
  const subs = {
    programNotifications: (_programId: Address, config: { filters?: unknown }) => ({
      subscribe: async ({ abortSignal }: { abortSignal: AbortSignal }) => {
        seenConfig = config as { filters?: readonly GetProgramAccountsMemcmpFilter[] };
        return (async function* () {
          for (const pubkey of notifications) {
            yield { value: { pubkey, account: { data: ["", "base64"] } } };
          }
          await waitForAbort(abortSignal);
        })();
      },
    }),
  };
  return {
    subs: subs as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    seenConfig: () => seenConfig,
  };
}

test("ProgramAccountListener forwards caller filters and fires onAccount per notification", async () => {
  const canonFilters = removedCanonItemFilters();
  const { subs, seenConfig } = fakeSubs([DISPUTE_A, DISPUTE_B]);
  const seen: Address[] = [];
  // Await the real signal — resolves once the second onAccount lands.
  const { promise: bothDone, resolve: signalBoth } = Promise.withResolvers<void>();
  const listener = new ProgramAccountListener({
    rpcSubscriptions: subs,
    programId: CANON_PROGRAM,
    filters: canonFilters,
    target: {
      onAccount: async (a: Address) => {
        seen.push(a);
        if (seen.length >= 2) signalBoth();
      },
      onResubscribe: async () => {},
    },
  });
  listener.start();
  await bothDone;
  listener.stop();
  expect(seen).toEqual([DISPUTE_A, DISPUTE_B]);
  // The canon GC filters — discriminator + state == Removed memcmp — reach
  // the RPC subscription verbatim.
  expect(seenConfig()?.filters).toEqual(canonFilters);
  expect(canonFilters[1]?.memcmp.bytes).toBe(canonItemStateFilter(ItemState.Removed).memcmp.bytes);
});

test("ProgramAccountListener defaults to the Dispute discriminator filter", async () => {
  const { subs, seenConfig } = fakeSubs([DISPUTE_A]);
  const { promise: one, resolve: signalOne } = Promise.withResolvers<void>();
  const listener = new ProgramAccountListener({
    rpcSubscriptions: subs,
    programId: PROGRAM_ID,
    target: {
      onAccount: async () => signalOne(),
      onResubscribe: async () => {},
    },
  });
  listener.start();
  await one;
  listener.stop();
  expect(seenConfig()?.filters).toEqual(DISPUTE_FILTERS);
});

/** Resolve when the abort signal fires (keeps the fake stream open like a real one). */
function waitForAbort(abortSignal: AbortSignal): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  if (abortSignal.aborted) resolve();
  else abortSignal.addEventListener("abort", () => resolve(), { once: true });
  return promise;
}
