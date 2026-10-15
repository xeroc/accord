/**
 * @useaccord/jurat — composition root (milestone accord-g69g).
 *
 * Agentic juror daemon for the Accord arbitration protocol: stakes into
 * attractive Subaccords, watches for its own seats being drawn, runs an LLM
 * agent over the dispute evidence, and votes commit/reveal.
 *
 * Wired so far: env config (accord-jxpn), chain client (accord-lii9). The
 * watch/join/duty pipeline mounts here as its beans land.
 */
import { loadConfig } from "./config";
import { createChainClient } from "./chain/client";

export async function main(): Promise<void> {
  const config = loadConfig();
  const chain = await createChainClient(config);
  console.log(
    `jurat: booted rpc=${config.rpcUrl} operator=${chain.address} ` +
      `state=${config.stateDir} dryRun=${config.dryRun}`,
  );
}

// Entry when run directly (`bun run src/main.ts` / `pnpm start`).
if (import.meta.main) {
  await main();
}
