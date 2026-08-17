// lifecycle.subaccord.spec.ts — create_subaccord PDA creation against Surfpool.
//
// Migrated from onchain-smoke.spec.ts. Proves a permissionless Subaccord inits
// at the canonical PDA (`["subaccord", creator, domain_ref]`): random domain_ref
// per run ⇒ a fresh PDA, so this spec is re-runnable within one Surfpool session
// (unlike the singleton AccordState in lifecycle.pause).
//
// Requires `make run_surfpool` (terminal 1). Skips cleanly on the offline CI
// lane — see AGENTS.md "e2e suite — tests/src".
import { createSubaccord } from "@useaccord/sdk";
import type { Address } from "@solana/kit";

import { expectAccordAccount } from "./setup/assertions.js";
import { createMint } from "./setup/tokens.js";
import { defaultSubaccordArgs } from "./setup/fixtures.js";
import { createTestEnv, type TestEnv } from "./setup/env.js";

describe("e2e: lifecycle.subaccord (requires Surfpool: `make run_surfpool`)", () => {
  let env: TestEnv;
  let mint!: Address;

  beforeAll(async () => {
    env = await createTestEnv();
    if (env.up) mint = (await createMint(env, 6)).mint;
  }, 60_000);

  it("createSubaccord inits a Subaccord PDA (init + owner check)", async () => {
    if (!env.up) return; // offline CI lane — see AGENTS.md "green rule"
    // L-4: staking_token/fee_token are validated as Account<Mint> at creation.
    const args = defaultSubaccordArgs(mint, mint, env.payer.address);
    const { instruction, subaccord } = await createSubaccord(
      env.accord.adapter,
      env.programId,
      env.payer.address,
      args,
    );
    await env.sendIx(instruction);
    await expectAccordAccount(env, subaccord);
  }, 30_000);
});
