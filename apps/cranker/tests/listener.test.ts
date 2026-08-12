/**
 * listener.test.ts — self-checks for the WS account listener (bean accord-gbxm).
 *
 * Pins the two things the live loop depends on:
 *   - the discriminator filter is built from the generated Dispute
 *     discriminator (so the subscription only delivers Dispute accounts);
 *   - the listener fires one `reconcileDispute` per account notification and is
 *     start/stop-safe.
 * The real reconnect loop is exercised end-to-end by the reconciler e2e suite
 * (Surfpool); here we drive it with a fake subscription stream and await the
 * reconciler calls directly (no wall-clock timers).
 */
import { test, expect } from "bun:test";
import { getBase64Encoder, type Address } from "@solana/kit";
import type { RpcSubscriptions, SolanaRpcSubscriptionsApi } from "@solana/kit";
import { DISPUTE_DISCRIMINATOR } from "@useaccord/sdk";
import { DISPUTE_FILTER_BYTES, ProgramAccountListener } from "../src/listener";

const PROGRAM_ID = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed" as Address;
const DISPUTE_A = "DisputeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const DISPUTE_B = "DisputeBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as Address;

test("DISPUTE_FILTER_BYTES is the base64 of the generated Dispute discriminator", () => {
  // Round-trip: the filter bytes decode back to exactly DISPUTE_DISCRIMINATOR.
  expect(Array.from(getBase64Encoder().encode(DISPUTE_FILTER_BYTES))).toEqual(
    Array.from(DISPUTE_DISCRIMINATOR),
  );
});

test("ProgramAccountListener fires reconcileDispute per account notification and is start/stop-safe", async () => {
  const reconciled: Address[] = [];
  // Await the real signal — resolves once the second reconcile lands. No polling.
  const { promise: bothDone, resolve: signalBoth } = Promise.withResolvers<void>();
  const reconciler = {
    reconcileDispute: async (a: Address) => {
      reconciled.push(a);
      if (reconciled.length >= 2) signalBoth();
    },
    reconcileAll: async () => {},
  };

  // A fake subscriptions client: yields two account notifications, then stays
  // open until aborted (like a real programNotifications stream does).
  const fakeSubs = {
    programNotifications: () => ({
      subscribe: async ({ abortSignal }: { abortSignal: AbortSignal }) => {
        return (async function* () {
          yield { value: { pubkey: DISPUTE_A, account: { data: ["", "base64"] } } };
          yield { value: { pubkey: DISPUTE_B, account: { data: ["", "base64"] } } };
          await waitForAbort(abortSignal);
        })();
      },
    }),
  } as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>;

  const listener = new ProgramAccountListener({
    rpcSubscriptions: fakeSubs,
    programId: PROGRAM_ID,
    reconciler,
  });
  listener.start();
  await bothDone;
  listener.stop();
  expect(reconciled).toEqual([DISPUTE_A, DISPUTE_B]);
});

/** Resolve when the abort signal fires (keeps the fake stream open like a real one). */
function waitForAbort(abortSignal: AbortSignal): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  if (abortSignal.aborted) resolve();
  else abortSignal.addEventListener("abort", () => resolve(), { once: true });
  return promise;
}
