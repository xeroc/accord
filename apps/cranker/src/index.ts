/**
 * @useaccord/cranker — entry point (placeholder, bean accord-7d4c).
 *
 * Only the plumbing boots today: RPC + funded wallet. The reconciler loop,
 * state resolver, and per-crank dispatch land in subsequent beans
 * (accord-rnel, accord-bpag). Running this logs readiness and exits — there
 * is no long-running loop yet.
 */
import { createSolanaRpc } from "@solana/kit";

import { loadCrankerWallet } from "./wallet.js";

function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ msg, ...fields }));
}

async function main(): Promise<void> {
  const rpcUrl = process.env.ACCORD_RPC_URL;
  if (rpcUrl === undefined || rpcUrl.trim().length === 0) {
    throw new Error("Missing required env var: ACCORD_RPC_URL");
  }
  const rpc = createSolanaRpc(rpcUrl);

  const wallet = await loadCrankerWallet(process.env, rpc);
  log("cranker placeholder ready", {
    address: wallet.address,
    balanceLamports: wallet.balanceLamports.toString(),
    rpcUrl,
  });
  log("reconciler not yet implemented", { bean: "accord-bpag" });
}

await main();
