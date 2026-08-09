/**
 * `useaccord draw:submit-panel` — submit the full panel's `draw_seat`
 * instructions in a loop (composite send). SDK: `methods.drawSeat` (vrf.ts:320).
 *
 * Either consume a `SeatMembership[]` JSON artifact from `draw:resolve-panel`
 * (`--membership <file|->`), OR run resolve-panel inline by passing
 * `--dispute`/`--round`/`--panel-size` without `--membership`. Sends one tx per
 * seat (1232B can't hold N proofs); the loaded wallet is `caller` for every tx.
 *
 * Not a banned `flow:*` composite (CLI.md §7 Q4) — this is a legitimate
 * per-seat draw primitive.
 */
import { Flags } from "@oclif/core";
import { findRoundPda, panelSizeForRound } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { jsonStringify } from "../../lib/output.js";
import {
  loadDrawTree,
  membershipFromJson,
  parseAddress,
  readInput,
  resolvePanelSeats,
} from "../../lib/draw-shared.js";

export default class DrawSubmitPanel extends ChainCommand {
  static summary = "Submit draw_seat for every seat in the panel (one tx each)";

  static description =
    "Submit the full panel's `draw_seat` instructions — one transaction per " +
    "seat. Provide the panel either as a `SeatMembership[]` JSON artifact from " +
    "`draw:resolve-panel` (`--membership <file|->`), or omit `--membership` to " +
    "run resolve-panel inline (`--dispute` + `--round` + optional " +
    "`--panel-size`). The round PDA is `init_if_needed`; the loaded wallet is " +
    "`caller` for every seat. Use `--dry-run` to inspect each built instruction.";

  static examples = [
    "<%= config.bin %> draw:resolve-panel --dispute <a> --out panel.json && " +
      "<%= config.bin %> draw:submit-panel --subaccord <a> --dispute <a> " +
      "--membership panel.json",
    "<%= config.bin %> draw:resolve-panel --dispute <a> | " +
      "bun run bin/dev.js draw:submit-panel --subaccord <a> --dispute <a> " +
      "--membership -",
    "<%= config.bin %> draw:submit-panel --subaccord <a> --dispute <a> " +
      "--round 1  # inline resolve + submit",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "The Dispute's parent Subaccord PDA",
      required: true,
    }),
    dispute: Flags.string({ description: "The Dispute PDA", required: true }),
    round: Flags.integer({
      description: "Round index (selects the round PDA + default panel size)",
      char: "r",
      default: 0,
    }),
    "panel-size": Flags.integer({
      description: "Override panel size when resolving inline (ignored with --membership)",
    }),
    "draw-attempt": Flags.integer({
      description: "Shortfall-redraw attempt (ADR-0021); 0 = initial draw",
      default: 0,
    }),
    membership: Flags.string({
      description:
        "SeatMembership[] JSON from resolve-panel (`-` = stdin, or a file). " +
        "Omit to resolve inline.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DrawSubmitPanel);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const dispute = parseAddress(flags.dispute, "dispute");
    const subaccord = parseAddress(flags.subaccord, "subaccord");

    // 1) Source the panel — either from --membership or by resolving inline.
    let panel: ReturnType<typeof membershipFromJson>[];
    if (flags.membership !== undefined) {
      const parsed = JSON.parse(readInput(flags.membership));
      if (!Array.isArray(parsed)) {
        this.error(`--membership must be a SeatMembership[] JSON array (got ${typeof parsed})`, {
          exit: 1,
        });
      }
      panel = (parsed as unknown[]).map(membershipFromJson);
    } else {
      const size = flags["panel-size"] ?? panelSizeForRound(flags.round) ?? 3;
      if (!Number.isInteger(size) || size <= 0) {
        this.error(`--panel-size must be a positive integer (got ${size})`, {
          exit: 1,
        });
      }
      const tc = await loadDrawTree(ctx, dispute);
      panel = await resolvePanelSeats(tc, flags.round, size, flags["draw-attempt"]);
    }

    // 2) Send one draw_seat per seat (one tx each — proofs don't fit in one).
    const [roundPda] = await findRoundPda({
      dispute,
      roundIdx: flags.round,
    });

    const signatures: string[] = [];
    for (let seat = 0; seat < panel.length; seat++) {
      const membership = panel[seat]!;
      const instruction = ctx.accord.methods.drawSeat(
        {
          caller: ctx.signer.address,
          subaccord,
          dispute,
        },
        roundPda,
        seat,
        membership,
      );

      if (flags["dry-run"]) {
        this.emitDryRun(instruction);
        continue;
      }
      signatures.push(await this.sendInstruction(ctx, instruction));
    }

    if (flags["dry-run"]) {
      // emitDryRun already printed each instruction; nothing more to add
      // unless --quiet collapsed them, in which case a one-line summary helps.
      if (flags.quiet) {
        this.log(`[dry-run] ${panel.length} draw_seat instructions built (not sent)`);
      }
      return;
    }

    if (flags.quiet) {
      for (const sig of signatures) this.log(sig);
      return;
    }
    if (flags.json) {
      this.log(jsonStringify({ signatures, seats: panel.length }));
      return;
    }
    // human: one block per seat.
    const lines: string[] = [`✓ submitted ${signatures.length} draw_seat txs`];
    for (let i = 0; i < signatures.length; i++) {
      lines.push(`  seat ${i}: ${signatures[i]}`);
    }
    lines.push(`  round ${flags.round}, panel ${panel.length}`);
    this.log(lines.join("\n"));
  }
}
