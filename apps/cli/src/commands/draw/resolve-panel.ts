/**
 * `useaccord draw:resolve-panel` — resolve the FULL panel off-chain (composite
 * read), emitting the JSON array `submit-panel` consumes.
 *
 * Loops {@link resolveSeat} × `panelSize` with deterministic collision
 * re-roll, accumulating the drawn jurors so each seat is distinct. Default
 * panel size is the round's on-chain ladder value (`panelSizeForRound`); override
 * with `--panel-size`. **Read-only** — emits `SeatMembership[]` JSON.
 *
 * Not a banned `flow:*` composite (CLI.md §7 Q4) — multi-call draw primitives
 * are legitimate per-seat operations, not end-to-end flows.
 */
import { Flags } from "@oclif/core";
import { panelSizeForRound } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { jsonStringify } from "../../lib/output.js";
import {
  loadDrawTree,
  membershipToJson,
  parseAddress,
  resolvePanelSeats,
  writeOutput,
} from "../../lib/draw-shared.js";

export default class DrawResolvePanel extends ChainCommand {
  static summary = "Resolve the full panel off-chain (read-only → JSON array)";

  static description =
    "Compute the full juror panel for `--round` against the Dispute's frozen " +
    "accumulator snapshot: loop `resolveSeat` × panelSize with collision " +
    "re-roll, so every seat is a distinct juror. Emits `SeatMembership[]` JSON " +
    "to `--out` (default stdout). Pipe into `draw:submit-panel --membership -`. " +
    "Default panel size follows the on-chain ladder (3 → 7 → 15 → 31); pass " +
    "`--panel-size` to override (e.g. for a partial redraw).";

  static examples = [
    "<%= config.bin %> draw:resolve-panel --dispute <addr> > panel.json",
    "<%= config.bin %> draw:resolve-panel --dispute <addr> --round 2 --out panel.json",
    "<%= config.bin %> draw:resolve-panel --dispute <addr> --panel-size 3 --out panel.json",
  ];

  static flags = {
    ...chainFlags,
    dispute: Flags.string({ description: "The Dispute PDA", required: true }),
    round: Flags.integer({
      description: "Round index (sortition domain separator + panel-ladder input)",
      char: "r",
      default: 0,
    }),
    "panel-size": Flags.integer({
      description: "Override the panel size (default: the round's ladder value)",
    }),
    "draw-attempt": Flags.integer({
      description: "Shortfall-redraw attempt (ADR-0021); 0 = initial draw",
      default: 0,
    }),
    out: Flags.string({
      description: "Write JSON to this file (`-` = stdout, default)",
      char: "o",
      default: "-",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DrawResolvePanel);
    this.applyOutput(flags);

    const panelSize = flags["panel-size"] ?? panelSizeForRound(flags.round) ?? 3;
    if (!Number.isInteger(panelSize) || panelSize <= 0) {
      this.error(`--panel-size must be a positive integer (got ${panelSize})`, {
        exit: 1,
      });
    }

    const ctx = await this.loadChain(flags);
    const tc = await loadDrawTree(ctx, parseAddress(flags.dispute, "dispute"));
    const panel = await resolvePanelSeats(tc, flags.round, panelSize, flags["draw-attempt"]);
    const artifact = jsonStringify(panel.map(membershipToJson));

    if (flags.out !== "-") {
      writeOutput(flags.out, artifact);
      this.emitRead(
        { wrote: flags.out, panelSize, seats: panel.length },
        {
          primary: String(panel.length),
          human: [
            `wrote ${flags.out}`,
            `  round ${flags.round}: ${panel.length} seats (panel-size ${panelSize})`,
          ],
        },
      );
      return;
    }

    if (flags.quiet) {
      this.emitRead(panel, { primary: String(panel.length) });
    } else {
      this.log(artifact);
    }
  }
}
