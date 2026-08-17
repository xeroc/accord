/**
 * `useaccord lifecycle:create-subaccord` — permissionless Subaccord creation
 * (lib.rs `create_subaccord`). SDK: `methods.createSubaccord`.
 *
 * The loaded `--keypair` wallet is the fee payer AND the on-chain Subaccord
 * authority (the SDK adapter hard-wires `authority: accord.signer`; there is no
 * `--authority` flag — single-signer model, CLI.md §7 Q5). `domain_ref` and
 * `evidence_spec` are 32-byte hashes; pass them as 64-char hex, or use
 * `--random-domain-id` to mint a fresh domain_ref (useful for dev so two runs
 * don't collide on the same `["subaccord", creator, domain_ref]` PDA).
 *
 * All args are validated by the SDK's `assertValid*` helpers inside
 * `createSubaccord` before the instruction is built (ADR-0010).
 */
import { Flags } from "@oclif/core";
import { randomBytes } from "node:crypto";
import { type Address } from "@solana/kit";

import {
  Aggregation,
  ShortfallPolicy,
  assertValidRiskType,
  DEFAULT_TREE_DEPTH,
  type CreateSubaccordArgs,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

/** 64-char hex → 32 bytes. Throws on length/charset mismatch. */
function hexToBytes32(name: string, hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`Invalid${name}: expected 64 hex chars (32 bytes), got ${hex.length} chars`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export default class LifecycleCreateSubaccord extends ChainCommand {
  static summary = "Create a new Subaccord (permissionless dispute pool)";

  static description =
    "Permissionlessly create a Subaccord — a stake-weighted dispute pool keyed " +
    "by an immutable (creator, domain_ref) namespace. The loaded wallet becomes " +
    "the Subaccord authority and the fee payer. All CaseTerms parameters " +
    "(windows, alpha, max_appeals, reveal threshold, shortfall policy, …) are " +
    "frozen at creation; later changes go through propose/execute-update.";

  static examples = [
    "<%= config.bin %> lifecycle:create-subaccord --random-domain-id \\\n" +
      "  --evidence-spec 0000…0001 --staking-token <mint> --fee-token <mint> \\\n" +
      "  --min-stake 1000 --alpha-bps 1000 --review-window 604800 --commit-window 172800 \\\n" +
      "  --reveal-window 172800 --appeal-window 259200 --max-appeals 3 \\\n" +
      "  --fee-per-juror 0 --reveal-threshold-bps 6666 --max-draw-attempts 3 \\\n" +
      "  --evidence-operator <addr>",
    "<%= config.bin %> lifecycle:create-subaccord --random-domain-id \\\n" +
      "  --evidence-spec 0000…0001 --staking-token <mint> --fee-token <mint> \\\n" +
      "  --min-stake 1000 --juror-credential <issuer> --juror-schema <schema> \\\n" +
      "  --evidence-operator <addr>  # credential-gated (attestation required to stake)",
  ];

  static flags = {
    ...chainFlags,
    "random-domain-id": Flags.boolean({
      description: "Generate a fresh random 32-byte domain_ref (dev: avoids PDA collisions)",
      default: false,
    }),
    "domain-id": Flags.string({
      description: "32-byte domain_ref as 64 hex chars (immutable Subaccord identity)",
    }),
    "evidence-spec": Flags.string({
      description: "32-byte evidence format spec hash as 64 hex chars (ADR-0006)",
      required: true,
    }),
    "staking-token": Flags.string({
      description: "SPL mint juror capital is staked in (collateral, ADR-0002/0020)",
      required: true,
    }),
    "fee-token": Flags.string({
      description:
        "Compensation mint — fees + appeal bonds (ADR-0020), distinct from --staking-token",
      required: true,
    }),
    "min-stake": Flags.string({
      description: "Minimum juror stake, in base units of the staking token",
      required: true,
    }),
    "alpha-bps": Flags.integer({
      description: "Slash factor in bps (10% = 1000)",
      required: true,
    }),
    "review-window": Flags.string({
      description: "Evidence review window in seconds",
      required: true,
    }),
    "commit-window": Flags.string({
      description: "Commit window in seconds",
      required: true,
    }),
    "reveal-window": Flags.string({
      description: "Reveal window in seconds",
      required: true,
    }),
    "appeal-window": Flags.string({
      description: "Post-round appeal window in seconds (≥ 3600; ADR-0022)",
      required: true,
    }),
    "max-appeals": Flags.integer({
      description: "Max appeals (0..3); bounds the appeal ladder depth",
      required: true,
    }),
    "min-jury-size": Flags.integer({
      description:
        "Round-1 juror panel size (accord-9q3e). Must be odd; the appeal ladder" +
        " (J+1)·2^maxAppeals − 1 must fit 31. Default 3; set 1 for a single-juror pool.",
      default: 3,
    }),
    aggregation: Flags.string({
      description: "Dispute-kit aggregation rule (ADR-0019)",
      options: ["Plurality"],
      default: "Plurality",
    }),
    "fee-per-juror": Flags.string({
      description: "Per-juror fee, in base units of the fee token",
      required: true,
    }),
    "reveal-threshold-bps": Flags.integer({
      description: "Reveal-quorum fraction in bps (2/3 = 6666; ADR-0021)",
      required: true,
    }),
    "shortfall-policy": Flags.string({
      description: "Policy when a round falls short of reveal quorum (ADR-0021)",
      options: ["Redraw"],
      default: "Redraw",
    }),
    "max-draw-attempts": Flags.integer({
      description: "Per-round redraw cap before the dispute fails (1..10; ADR-0021)",
      required: true,
    }),
    "evidence-operator": Flags.string({
      description: "ADR-0006 trusted re-encryption service address",
      required: true,
    }),
    "juror-credential": Flags.string({
      description:
        "PROG-ATTESTTION: attestation issuer (SAS credential) gating the juror pool. " +
        "Both-or-neither with --juror-schema; omit for a stake-only Subaccord (default).",
    }),
    "juror-schema": Flags.string({
      description:
        "PROG-ATTESTTION: schema the juror's SAS attestation must match. " +
        "Both-or-neither with --juror-credential; omit for stake-only (default).",
    }),
    depth: Flags.integer({
      description: "Fixed accumulator tree depth (bounds the juror pool at 2^depth)",
      default: DEFAULT_TREE_DEPTH,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LifecycleCreateSubaccord);
    this.applyOutput(flags);
    // PROG-ATTESTTION: the credential gate is both-or-neither. Omit both ⇒ stake-only.
    const jurorCredential = flags["juror-credential"] as Address | undefined;
    const jurorSchema = flags["juror-schema"] as Address | undefined;
    if ((jurorCredential !== undefined) !== (jurorSchema !== undefined)) {
      this.error(
        "--juror-credential and --juror-schema are both-or-neither: pass both to gate the " +
          "juror pool on a SAS attestation, or omit both for a stake-only Subaccord (default).",
        { exit: 1 },
      );
    }

    const domainRef = flags["random-domain-id"]
      ? randomBytes(32)
      : hexToBytes32("RiskType", flags["domain-id"] ?? "");
    // Eager validation so a zero/bad domain_ref errors before chain load.
    assertValidRiskType(domainRef);
    const evidenceSpec = hexToBytes32("EvidenceSpec", flags["evidence-spec"]);

    const ctx = await this.loadChain(flags);
    const args: CreateSubaccordArgs = {
      domainRef,
      evidenceSpec,
      stakingToken: flags["staking-token"] as Address,
      feeToken: flags["fee-token"] as Address,
      minStake: BigInt(flags["min-stake"]),
      alphaBps: flags["alpha-bps"],
      reviewWindow: BigInt(flags["review-window"]),
      commitWindow: BigInt(flags["commit-window"]),
      revealWindow: BigInt(flags["reveal-window"]),
      appealWindow: BigInt(flags["appeal-window"]),
      maxAppeals: flags["max-appeals"],
      minJurySize: flags["min-jury-size"],
      aggregation:
        flags.aggregation === "Plurality" ? Aggregation.Plurality : Aggregation.Plurality,
      feePerJuror: BigInt(flags["fee-per-juror"]),
      revealThresholdBps: flags["reveal-threshold-bps"],
      shortfallPolicy:
        flags["shortfall-policy"] === "Redraw" ? ShortfallPolicy.Redraw : ShortfallPolicy.Redraw,
      maxDrawAttempts: flags["max-draw-attempts"],
      // Single-signer model: the wallet IS the authority (no --authority flag).
      authority: ctx.signer.address,
      evidenceOperator: flags["evidence-operator"] as Address,
      depth: flags.depth,
      // PROG-ATTESTTION: optional credential gate (both-or-neither; omit ⇒ stake-only).
      ...(jurorCredential !== undefined && jurorSchema !== undefined
        ? { jurorCredential, jurorSchema }
        : {}),
    };

    const { instruction, subaccord, bump } = await ctx.accord.methods.createSubaccord(
      ctx.signer.address,
      args,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { authority: ctx.signer.address, subaccord, bump });
  }
}
