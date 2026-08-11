/**
 * `useaccord staking:prune-juror` — permissionless crank (PROG-ATTESTTION) that
 * evicts a juror whose SAS attestation has expired from a credential-gated
 * Subaccord. SDK: `methods.pruneJuror` (staking.ts). On-chain: `prune_juror`.
 *
 * The caller (loaded `--keypair` wallet) signs; the expired juror does NOT.
 * The instruction removes the juror's stake leaf, recomputes the accumulator
 * root via a Merkle `path`, and reads the expired attestation from
 * `remaining_accounts[0]`. Any account may run this — it is a permissionless
 * crank, like `staking:reconcile`.
 *
 * `--juror` is REQUIRED (the expired juror, never the caller). The MST path is
 * the expired juror's accumulator proof — auto-built by default, or
 * `--path-from <file>` for offline/advanced (mirrors `staking:request-withdraw`).
 */
import { Flags } from "@oclif/core";
import type { Address } from "@solana/kit";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import {
  resolveStaking,
  resolveProof,
  readProofFile,
} from "../../staking-context.js";

export default class StakingPruneJuror extends ChainCommand {
  static summary = "Evict an attestation-expired juror from a gated Subaccord (permissionless)";

  static description =
    "Permissionless crank (PROG-ATTESTTION): remove a juror whose SAS " +
    "attestation has expired from a credential-gated Subaccord. The loaded " +
    "wallet is the caller (signs); `--juror` is the expired juror (does not " +
    "sign). Recomputes the accumulator root via the expired juror's MST proof. " +
    "Auto-builds the proof by default; `--path-from` for offline/advanced.";

  static examples = [
    "<%= config.bin %> staking:prune-juror --subaccord 7vrF… --juror 9aJb… --attestation <sas>",
    "<%= config.bin %> staking:prune-juror --subaccord 7vrF… --juror 9aJb… --attestation <sas> --path-from proof.json",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Credential-gated Subaccord PDA address",
      required: true,
    }),
    juror: Flags.string({
      description: "Expired juror to evict (does NOT sign — distinct from the caller)",
      required: true,
    }),
    attestation: Flags.string({
      description: "The expired juror's SAS attestation account (remaining_accounts[0])",
      required: true,
    }),
    "path-from": Flags.string({
      description:
        "Read the MST proof from a JSON file instead of auto-building (offline / advanced)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StakingPruneJuror);
    this.applyOutput(flags);

    // Read a manual proof BEFORE any chain access so a bad file fails fast.
    const manualPath = flags["path-from"] ? readProofFile(flags["path-from"]) : null;

    const ctx = await this.loadChain(flags);
    // The juror is the EXPIRED juror, not the caller — required, never defaulted.
    const juror = flags.juror as Address;

    // resolveStaking fetches the Subaccord + derives the juror's JurorStake PDA
    // (findJurorStakePda) the same way `stake` does; resolveProof then builds the
    // expired juror's accumulator proof.
    const r = await resolveStaking(ctx, flags.subaccord as Address, juror);
    const { path, index } = manualPath
      ? { path: manualPath, index: null }
      : await resolveProof(ctx, r);

    const accounts = {
      caller: ctx.signer.address,
      juror: r.juror,
      subaccord: r.subaccord,
      jurorStake: r.jurorStake,
    };
    const instruction = ctx.accord.methods.pruneJuror(
      accounts,
      path,
      flags.attestation as Address,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      subaccord: r.subaccord,
      jurorStake: r.jurorStake,
      juror: r.juror,
      attestation: flags.attestation,
      leafIndex: index,
      mode: flags["path-from"] ? "manual" : "auto",
    });
  }
}
