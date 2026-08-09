/**
 * `useaccord staking:request-withdraw` — phase 1 of the two-phase withdraw
 * (REVIEW #5). SDK: `methods.requestWithdraw` (staking.ts:203).
 *
 * Ledger-only: subtracts `--amount` from `JurorStake.staked`, banks it in
 * `pending_withdrawal`, and recomputes the accumulator root. No tokens move;
 * no `active_draws` gate (the lock is enforced at `withdraw`). Allowed while
 * paused. The same auto/manual path resolution as `stake` applies.
 */
import { Flags } from "@oclif/core";
import type { Address } from "@solana/kit";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import {
  resolveStaking,
  resolveProof,
  readProofFile,
  stakingAccounts,
} from "../../staking-context.js";

export default class StakingRequestWithdraw extends ChainCommand {
  static summary = "Request a withdrawal (phase 1 — banks a pending withdrawal)";

  static description =
    "Subtract `--amount` from JurorStake.staked into pending_withdrawal and " +
    "recompute the accumulator root. No tokens move; claim them later with " +
    "`staking:withdraw` once WITHDRAWAL_DELAY elapses and active_draws == 0. " +
    "Auto-builds the MST proof by default; `--path-from` for offline/advanced.";

  static examples = [
    "<%= config.bin %> staking:request-withdraw --subaccord 7vrF… --amount 500",
    "<%= config.bin %> staking:request-withdraw --subaccord 7vrF… --amount 500 --path-from proof.json",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA address",
      required: true,
    }),
    amount: Flags.string({
      description: "Amount of staking_token to bank for withdrawal (u64, raw units)",
      required: true,
    }),
    juror: Flags.string({
      description: "Staking juror (defaults to the loaded signer)",
    }),
    "path-from": Flags.string({
      description:
        "Read the MST proof from a JSON file instead of auto-building (offline / advanced)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StakingRequestWithdraw);
    this.applyOutput(flags);

    // Read a manual proof BEFORE any chain access so a bad file fails fast.
    const manualPath = flags["path-from"] ? readProofFile(flags["path-from"]) : null;

    const ctx = await this.loadChain(flags);
    const juror = (flags.juror as Address | undefined) ?? ctx.signer.address;
    const amount = BigInt(flags.amount);

    const r = await resolveStaking(ctx, flags.subaccord as Address, juror);
    const { path, index } = manualPath
      ? { path: manualPath, index: null }
      : await resolveProof(ctx, r);

    const instruction = ctx.accord.methods.requestWithdraw(stakingAccounts(r), amount, path);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      subaccord: r.subaccord,
      jurorStake: r.jurorStake,
      amount,
      leafIndex: index,
      mode: flags["path-from"] ? "manual" : "auto",
    });
  }
}
