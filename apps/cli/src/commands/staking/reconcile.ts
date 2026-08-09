/**
 * `useaccord staking:reconcile` — permissionless crank that folds a juror's
 * `settlement_delta` into their canonical `staked` and updates the accumulator
 * root via a Merkle proof (REVIEW #4). SDK: `methods.reconcileStake`
 * (staking.ts:245).
 *
 * After reconcile, the ledger and the accumulator agree again. No tokens move;
 * any caller may trigger it. Same auto/manual path resolution as `stake`.
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

export default class StakingReconcile extends ChainCommand {
  static summary = "Reconcile a juror's pending settlement delta into staked";

  static description =
    "Fold a juror's settlement_delta into their canonical staked amount and " +
    "recompute the accumulator root. Permissionless (any caller). No tokens " +
    "move. Auto-builds the MST proof by default; `--path-from` for offline.";

  static examples = [
    "<%= config.bin %> staking:reconcile --subaccord 7vrF… --juror 9aJb…",
    "<%= config.bin %> staking:reconcile --subaccord 7vrF… --path-from proof.json",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA address",
      required: true,
    }),
    juror: Flags.string({
      description: "Juror whose stake to reconcile (defaults to the loaded signer)",
    }),
    "path-from": Flags.string({
      description:
        "Read the MST proof from a JSON file instead of auto-building (offline / advanced)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StakingReconcile);
    this.applyOutput(flags);

    // Read a manual proof BEFORE any chain access so a bad file fails fast.
    const manualPath = flags["path-from"] ? readProofFile(flags["path-from"]) : null;

    const ctx = await this.loadChain(flags);
    const juror = (flags.juror as Address | undefined) ?? ctx.signer.address;

    const r = await resolveStaking(ctx, flags.subaccord as Address, juror);
    const { path, index } = manualPath
      ? { path: manualPath, index: null }
      : await resolveProof(ctx, r);

    const instruction = ctx.accord.methods.reconcileStake(stakingAccounts(r), path);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      subaccord: r.subaccord,
      jurorStake: r.jurorStake,
      leafIndex: index,
      mode: flags["path-from"] ? "manual" : "auto",
    });
  }
}
