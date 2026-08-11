/**
 * `useaccord draw:request-vrf` — request the magicblock VRF for a Dispute (the
 * one-shot oracle CPI that freezes the accumulator root at callback time).
 * SDK: `methods.requestVrf` (vrf.ts:281).
 *
 * The loaded `--keypair` wallet is `caller` (fee payer + the cranker that
 * signs `request_vrf`). `--subaccord`/`--dispute` identify the case;
 * `--oracle-queue` is the VRF oracle queue; `--program-identity` (the Accord
 * program-identity PDA, CPI authority) is auto-derived when omitted.
 *
 * ⚠ Surfpool caveat: `request_vrf` CPIs the magicblock VRF oracle, which is
 * NOT deployed on a Surfnet — so this command REVERTS there. For local e2e,
 * inject `committed_vrf` directly (see `tests/src/setup/vrf.ts`). The command
 * is still useful against devnet/mainnet and for `--dry-run` instruction dumps.
 */
import { Flags } from "@oclif/core";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { parseAddress } from "../../lib/draw-shared.js";
import { findProgramIdentityPda } from "@useaccord/sdk";

export default class DrawRequestVrf extends ChainCommand {
  static summary = "Request the magicblock VRF for a Dispute (reverts on Surfpool)";

  static description =
    "Trigger the one-shot VRF oracle CPI for `dispute`. The oracle's callback " +
    "commits `dispute.committed_vrf` AND atomically freezes the live " +
    "accumulator root (`frozen_root` + `frozen_total_stake`) — every " +
    "`draw_seat` for every round of this dispute then selects against that " +
    "one frozen root.\n\n" +
    "⚠ On a Surfnet (local validator) the VRF oracle is not deployed, so this " +
    "instruction REVERTS. For local e2e, inject `committed_vrf` directly via " +
    "`surfnet_setAccount` (see tests/src/setup/vrf.ts#injectCommittedVrf). " +
    "Use `--dry-run` to inspect the instruction without sending.";

  static examples = [
    "<%= config.bin %> draw:request-vrf --subaccord <addr> --dispute <addr> " +
      "--oracle-queue <addr>",
    "<%= config.bin %> draw:request-vrf --dispute <addr> --subaccord <addr> " +
      "--oracle-queue <addr> --program-identity <addr> --dry-run",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "The Dispute's parent Subaccord PDA",
      required: true,
    }),
    dispute: Flags.string({
      description: "The Dispute PDA to request the VRF for",
      required: true,
    }),
    "oracle-queue": Flags.string({
      description: "magicblock VRF oracle queue account",
      required: true,
    }),
    "program-identity": Flags.string({
      description:
        "Accord program-identity PDA (CPI authority for the VRF oracle). " +
        "Optional — defaults to the canonical derived PDA.",
    }),
  };

  static args = {};

  async run(): Promise<void> {
    const { flags } = await this.parse(DrawRequestVrf);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const programIdentity = flags["program-identity"]
      ? parseAddress(flags["program-identity"], "program-identity")
      : (await findProgramIdentityPda())[0];
    const instruction = ctx.accord.methods.requestVrf(
      {
        caller: ctx.signer.address,
        subaccord: parseAddress(flags.subaccord, "subaccord"),
        dispute: parseAddress(flags.dispute, "dispute"),
      },
      {
        oracleQueue: parseAddress(flags["oracle-queue"], "oracle-queue"),
        programIdentity,
      },
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { dispute: flags.dispute });
  }
}
