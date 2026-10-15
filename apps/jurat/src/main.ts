/**
 * @useaccord/jurat — composition root (milestone accord-g69g).
 *
 * Agentic juror daemon for the Accord arbitration protocol: stakes into
 * attractive Subaccords, watches for its own seats being drawn, runs an LLM
 * agent over the dispute evidence, and votes commit/reveal.
 *
 * Wired so far: env config (accord-jxpn). The chain client (accord-lii9) and
 * the duty pipeline mount here as their beans land.
 */
import { loadConfig } from "./config";

export async function main(): Promise<void> {
  const config = loadConfig();
  console.log(
    `jurat: booted rpc=${config.rpcUrl} state=${config.stateDir} dryRun=${config.dryRun}`,
  );
}

// Entry when run directly (`bun run src/main.ts` / `pnpm start`).
if (import.meta.main) {
  await main();
}
