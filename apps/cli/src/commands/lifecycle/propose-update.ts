/**
 * `useaccord lifecycle:propose-update` — authority-gated Subaccord parameter
 * update proposal (lib.rs `propose_subaccord_update`). SDK:
 * `methods.proposeSubaccordUpdate`. Arms the `UPDATE_TIMELOCK_SLOTS` (48h)
 * on-chain timelock.
 *
 * The loaded `--keypair` wallet signs as the Subaccord authority (single-signer
 * model). `--payload` is a single `Kind:value` token naming one mutable field
 * (see UpdatePayload); domain_ref/evidence_spec are immutable and absent.
 *
 * Because the SDK cannot predict the exact landing slot, the flow is: propose →
 * read `execute_after_slot` back from the PendingUpdate account → wait until
 * `canExecuteAt` → execute. On send this command reads `executeAfterSlot` and
 * emits it alongside the signature so the operator knows when to execute.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { type UpdatePayload } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

/** Parse `Kind:value` into a typed UpdatePayload. Throws on a bad kind/value. */
function parsePayload(raw: string): UpdatePayload {
  const idx = raw.indexOf(":");
  if (idx < 0) throw new Error(`InvalidPayload: expected Kind:value, got "${raw}"`);
  const kind = raw.slice(0, idx);
  const value = raw.slice(idx + 1);
  switch (kind) {
    case "MinStake":
    case "ReviewWindow":
    case "CommitWindow":
    case "RevealWindow":
    case "AppealWindow":
    case "FeePerJuror":
      return { __kind: kind, fields: [BigInt(value)] };
    case "AlphaBps":
    case "MaxAppeals": {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new Error(`InvalidPayload: ${kind} expects an integer`);
      return { __kind: kind, fields: [n] };
    }
    case "Authority":
    case "EvidenceOperator":
      return { __kind: kind, fields: [value as Address] };
    default:
      throw new Error(
        `InvalidPayload: unknown kind "${kind}". Expected one of MinStake, AlphaBps, ` +
          "ReviewWindow, CommitWindow, RevealWindow, AppealWindow, MaxAppeals, " +
          "FeePerJuror, Authority, EvidenceOperator.",
      );
  }
}

export default class LifecycleProposeUpdate extends ChainCommand {
  static summary = "Propose a Subaccord parameter update (arms the 48h timelock)";

  static description =
    "Authority-gated proposal to update one mutable Subaccord parameter " +
    "(min_stake, alpha_bps, windows, max_appeals, fee_per_juror, authority, or " +
    "evidence_operator). domain_ref and evidence_spec are immutable. Arms " +
    "UPDATE_TIMELOCK_SLOTS (48h) on-chain; read back the exact execute slot " +
    "from the PendingUpdate account after sending, then run " +
    "lifecycle:execute-update once it elapses.";

  static examples = [
    "<%= config.bin %> lifecycle:propose-update --subaccord <pda> --payload MinStake:2000",
    "<%= config.bin %> lifecycle:propose-update --subaccord <pda> --nonce 1 --payload AlphaBps:1500",
    "<%= config.bin %> lifecycle:propose-update --subaccord <pda> --payload Authority:<newAuthority>",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA to update",
      required: true,
    }),
    nonce: Flags.string({
      description: "Update nonce (u64); increments per proposal. Default 0.",
      default: "0",
    }),
    payload: Flags.string({
      description:
        "Update payload as Kind:value — e.g. MinStake:2000, AlphaBps:1500, " +
        "ReviewWindow:86400, MaxAppeals:2, Authority:<addr>, EvidenceOperator:<addr>",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LifecycleProposeUpdate);
    this.applyOutput(flags);

    const payload = parsePayload(flags.payload);
    const nonce = BigInt(flags.nonce);

    const ctx = await this.loadChain(flags);
    const { instruction, pendingUpdate } = await ctx.accord.methods.proposeSubaccordUpdate(
      ctx.signer.address,
      flags.subaccord as Address,
      nonce,
      payload,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    // Read the exact execute slot back from the landed PendingUpdate account.
    const executeAfterSlot = await ctx.accord.methods.getUpdateExecuteAfterSlot(pendingUpdate);
    this.emitSend(signature, {
      subaccord: flags.subaccord,
      pendingUpdate,
      executeAfterSlot,
    });
  }
}
