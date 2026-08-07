// lifecycle.subaccord.spec.ts — create_subaccord PDA creation against Surfpool.
//
// Migrated from onchain-smoke.spec.ts. Proves a permissionless Subaccord inits
// at the canonical PDA (`["subaccord", creator, risk_type]`): random risk_type
// per run ⇒ a fresh PDA, so this spec is re-runnable within one Surfpool session
// (unlike the singleton PauseState in lifecycle.pause).
//
// Requires `make run_surfpool` (terminal 1). Skips cleanly on the offline CI
// lane — see AGENTS.md "e2e suite — tests/src".
import { createSubaccord } from "@accord/sdk";

import { expectAccordAccount } from "./setup/assertions.js";
import { defaultSubaccordArgs } from "./setup/fixtures.js";
import { createTestEnv, type TestEnv } from "./setup/env.js";

describe("e2e: lifecycle.subaccord (requires Surfpool: `make run_surfpool`)", () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 60_000);

  it("createSubaccord inits a Subaccord PDA (init + owner check)", async () => {
    if (!env.up) return; // offline CI lane — see AGENTS.md "green rule"
    // stakingToken isn't validated at creation (only at stake time), so the
    // payer address suffices as a placeholder here.
    const args = defaultSubaccordArgs(
      env.payer.address,
      env.payer.address,
      env.payer.address,
    );
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
