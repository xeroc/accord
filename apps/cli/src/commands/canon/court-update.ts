/**
 * `useaccord canon:court-update` — authority-gated proposal to retune the
 * list's backing-court params (canon lib.rs `propose_court_update`, CPI to
 * Accord `propose_subaccord_update`). SDK: `@useaccord/canon`
 * `proposeCourtUpdate`.
 *
 * The CanonList PDA signs as the Subaccord authority (invoke_signed); the
 * loaded wallet must equal `CanonList.authority` and pays the PendingUpdate
 * rent. `--payload` is a single `Kind:value` token; the `Authority` kind is
 * rejected (the court authority is pinned to the list PDA forever), as are
 * `min_jury_size`/`depth` (immutable on the Subaccord). Arms the 48h Accord
 * timelock; afterwards run `lifecycle:execute-update` (permissionless — no
 * canon wrapper) once the slot elapses.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { type UpdatePayload } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { requireCanonList } from "../../canon-context.js";
import { proposeCourtUpdate } from "@useaccord/canon";

/** Parse `Kind:value` into a typed UpdatePayload. Throws on a bad kind/value;
 * `Authority` is rejected client-side (canon rejects it on-chain too). */
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
    case "MaxAppeals":
    case "RevealThresholdBps":
    case "MaxDrawAttempts": {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new Error(`InvalidPayload: ${kind} expects an integer`);
      return { __kind: kind, fields: [n] };
    }
    case "EvidenceOperator":
      return { __kind: kind, fields: [value as Address] };
    case "Authority":
      throw new Error(
        "InvalidPayload: Authority is forbidden — the court authority is pinned " +
          "to the CanonList PDA (rotating it would permanently strand retuning).",
      );
    default:
      throw new Error(
        `InvalidPayload: unknown kind "${kind}". Expected one of MinStake, AlphaBps, ` +
          "ReviewWindow, CommitWindow, RevealWindow, AppealWindow, MaxAppeals, " +
          "FeePerJuror, EvidenceOperator, RevealThresholdBps, MaxDrawAttempts.",
      );
  }
}

export default class CanonCourtUpdate extends ChainCommand {
  static summary = "Propose a backing-court param update (48h Accord timelock)";

  static description =
    "Retune the list's backing Subaccord params (min_stake, alpha_bps, " +
    "windows, max_appeals, fee_per_juror, evidence_operator, " +
    "reveal_threshold_bps, max_draw_attempts) through Accord's 48h timelock. " +
    "The CanonList PDA signs as the court authority; the loaded wallet must " +
    "be the list authority and pays the PendingUpdate rent. min_jury_size " +
    "and depth are immutable; Authority payloads are forbidden. After the " +
    "timelock elapses, land it with lifecycle:execute-update (permissionless).";

  static examples = [
    "<%= config.bin %> canon:court-update --list <pda> --payload MinStake:2000",
    "<%= config.bin %> canon:court-update --list <pda> --nonce 1 --payload AlphaBps:1500",
    "<%= config.bin %> canon:court-update --list <pda> --payload RevealThresholdBps:8000",
  ];

  static flags = {
    ...chainFlags,
    list: Flags.string({
      description: "CanonList PDA whose backing court to retune",
      required: true,
    }),
    nonce: Flags.string({
      description: "Update nonce (u64); increments per proposal. Default 0.",
      default: "0",
    }),
    payload: Flags.string({
      description:
        "Update payload as Kind:value — e.g. MinStake:2000, AlphaBps:1500, " +
        "ReviewWindow:86400, MaxAppeals:2, EvidenceOperator:<addr>",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonCourtUpdate);
    this.applyOutput(flags);

    const payload = parsePayload(flags.payload);
    const nonce = BigInt(flags.nonce);

    const ctx = await this.loadChain(flags);
    const listAddress = flags.list as Address;
    // The backing Subaccord comes from the on-chain list — never re-derived.
    const { subaccord } = await requireCanonList(ctx, listAddress);

    const { instruction, pendingUpdate } = await proposeCourtUpdate(
      { caller: ctx.signer, list: listAddress, subaccord },
      { nonce, payload },
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    // Read the exact execute slot back from the landed PendingUpdate account.
    const executeAfterSlot = await ctx.accord.methods.getUpdateExecuteAfterSlot(pendingUpdate);
    this.emitSend(signature, {
      list: listAddress,
      subaccord,
      pendingUpdate,
      executeAfterSlot,
    });
  }
}
