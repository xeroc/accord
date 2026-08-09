/**
 * listener.test.ts — self-checks for the WS listener (bean accord-gbxm).
 *
 * Covers the non-trivial pure logic: the best-effort dispute-address parser.
 * The live WS reconnect loop is exercised end-to-end by the reconciler e2e
 * suite (Surfpool); here we pin the parser contract that the loop depends on.
 */
import { test, expect } from "bun:test";
import { extractDisputeCandidates, ProgramLogListener } from "../src/listener";
import type { Address } from "@solana/kit";

const DISPUTE = "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed" as Address;

test("extractDisputeCandidates pulls base58 address tokens out of program log lines", () => {
  const logs = [
    `Program log: Instruction: CreateDispute`,
    `Program data: ${DISPUTE} Qmaa…`,
    `Program cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed consumed 4321 of 200000 compute units`,
  ];
  const out = extractDisputeCandidates(logs);
  expect(out).toContain(DISPUTE);
});

test("extractDisputeCandidates de-duplicates within one notification", () => {
  const logs = [`Program data: ${DISPUTE}`, `Program log: ${DISPUTE} accepted`];
  const out = extractDisputeCandidates(logs);
  expect(out.filter((a) => a === DISPUTE)).toHaveLength(1);
});

test("extractDisputeCandidates ignores 88-char signatures and short noise", () => {
  const sig = "5".repeat(88); // a 64-byte sig base58 ≈ 88 chars — not an address
  const logs = [`Program log: noise ${sig} ok`];
  expect(extractDisputeCandidates(logs)).toHaveLength(0);
});

test("ProgramLogListener fires reconcileDispute per candidate and is start/stop-safe", async () => {
  const reconciled: string[] = [];
  const reconciler = {
    reconcileDispute: async (a: Address) => {
      reconciled.push(a);
    },
    reconcileAll: async () => {},
  };

  // A fake subscriptions client: yields one notification, then stays open
  // until aborted (like a real logsNotifications stream does).
  let subscribed = false;
  const fakeSubs = {
    logsNotifications: () => ({
      subscribe: async ({ abortSignal }: { abortSignal: AbortSignal }) => {
        subscribed = true;
        return (async function* () {
          yield { value: { logs: [`Program data: ${DISPUTE}`] } };
          await new Promise<void>((resolve) => {
            if (abortSignal.aborted) return resolve();
            abortSignal.addEventListener("abort", () => resolve(), { once: true });
          });
        })();
      },
    }),
  } as unknown as import("@solana/kit").RpcSubscriptions<
    import("@solana/kit").SolanaRpcSubscriptionsApi
  >;

  const listener = new ProgramLogListener({
    rpcSubscriptions: fakeSubs,
    programId: DISPUTE,
    reconciler,
  });
  listener.start();
  // Wait for the fake stream to be consumed.
  await waitFor(() => subscribed && reconciled.length > 0);
  listener.stop();
  expect(reconciled).toContain(DISPUTE);
});

function waitFor(cond: () => boolean, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 10);
    };
    tick();
  });
}
