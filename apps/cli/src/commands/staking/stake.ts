/**
 * `useaccord staking:stake` — deposit juror collateral into a Subaccord's
 * stake_vault. SDK: `methods.stake` (staking.ts:178).
 *
 * SPL-transfers `--amount` of the Subaccord's `staking_token` from the juror's
 * ATA into the Subaccord PDA's vault ATA, crediting `JurorStake.staked` and
 * recomputing the accumulator root via a Merkle `path` (ADR-0012). Reverts while
 * the circuit breaker is paused.
 *
 * Path mode:
 *   - auto (default) — fetch all JurorStakes + `prepareStakeProof`; aborts with
 *     `AccumulatorRootMismatch` on stale data (retry the read).
 *   - `--path-from <file>` — read a proof JSON (e.g. output of
 *     `accumulator:prepare-stake-proof`) for offline / advanced use.
 *
 * The loaded `--keypair` wallet is fee payer + the signing juror; override the
 * juror with `--juror` only when it equals the signer (the adapter pins
 * `accord.signer`, so a non-signer juror is a dry-run-only inspection).
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

export default class StakingStake extends ChainCommand {
  static summary = "Stake juror collateral into a Subaccord";

  static description =
    "Deposit `--amount` of the Subaccord's staking_token into its stake_vault, " +
    "crediting JurorStake.staked. Auto-builds the MST accumulator proof by " +
    "default; use `--path-from <file>` to supply an offline proof " +
    "(accumulator:prepare-stake-proof output).";

  static examples = [
    "<%= config.bin %> staking:stake --subaccord 7vrF… --amount 1_000_000",
    "<%= config.bin %> staking:stake --subaccord 7vrF… --amount 1000 --path-from proof.json",
    "<%= config.bin %> staking:stake --subaccord 7vrF… --amount 1000 --dry-run",
    "<%= config.bin %> staking:stake --subaccord 7vrF… --amount 1000 --attestation <sas>  # credential-gated",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA address",
      required: true,
    }),
    amount: Flags.string({
      description: "Amount of staking_token to stake (u64, raw units)",
      required: true,
    }),
    juror: Flags.string({
      description: "Staking juror (defaults to the loaded signer)",
    }),
    "pause-state": Flags.string({
      description: "PauseState PDA (auto-derived singleton if omitted)",
    }),
    "path-from": Flags.string({
      description:
        "Read the MST proof from a JSON file instead of auto-building (offline / advanced)",
    }),
    attestation: Flags.string({
      description:
        "PROG-ATTESTTION: the juror's SAS attestation account. Forwarded as the " +
        "6th facade arg; valid only on credential-gated Subaccords (omit for stake-only).",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StakingStake);
    this.applyOutput(flags);

    // Read a manual proof BEFORE any chain access so a bad file fails fast.
    const manualPath = flags["path-from"] ? readProofFile(flags["path-from"]) : null;

    const ctx = await this.loadChain(flags);
    const juror = (flags.juror as Address | undefined) ?? ctx.signer.address;
    const amount = BigInt(flags.amount);

    const r = await resolveStaking(ctx, flags.subaccord as Address, juror, {
      pauseState: flags["pause-state"] as Address | undefined,
    });
    const { path, index } = manualPath
      ? { path: manualPath, index: null }
      : await resolveProof(ctx, r);

    const attestation = flags["attestation"] as Address | undefined;
    const instruction = ctx.accord.methods.stake(stakingAccounts(r), amount, path, attestation);

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
