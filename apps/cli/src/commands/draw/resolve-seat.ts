/**
 * `useaccord draw:resolve-seat` — resolve ONE seat's membership off-chain
 * (deterministic collision re-roll), emitting the JSON `seat` consumes.
 *
 * Reads the Dispute's `committed_vrf` + `frozen_root`/`frozen_total_stake`,
 * rebuilds the MST from the Subaccord's JurorStake accounts, verifies the
 * rebuild matches the frozen root, then runs {@link resolveSeat} for the given
 * seat. **Read-only** — emits a `SeatMembership` JSON object (CLI.md §1.6
 * pipeline format; pipe to `draw:seat --membership -`).
 *
 * SDK: `resolveSeat` (vrf.ts:157) + `buildAccumulator` (mst.ts:135).
 */
import { Flags } from "@oclif/core";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { jsonStringify } from "../../lib/output.js";
import {
  loadDrawTree,
  membershipToJson,
  parseAddress,
  resolveOneSeat,
  writeOutput,
} from "../../lib/draw-shared.js";

export default class DrawResolveSeat extends ChainCommand {
  static summary = "Resolve one seat's membership off-chain (read-only → JSON)";

  static description =
    "Compute the (leaf, proof, retries) for a single seat against the Dispute's " +
    "frozen accumulator snapshot and emit a `SeatMembership` JSON object to " +
    "`--out` (default stdout). Pipe the output into `draw:seat --membership -`. " +
    "Read-only — sends nothing. The deterministic collision re-roll count is " +
    "embedded as `retries`; `draw_seat` independently verifies every prior " +
    "retry collided.";

  static examples = [
    "<%= config.bin %> draw:resolve-seat --dispute <addr> --seat 0 > seat0.json",
    "<%= config.bin %> draw:resolve-seat --dispute <addr> --round 1 --seat 4 " +
      "--draw-attempt 0 --out seat4.json",
    "<%= config.bin %> draw:resolve-seat --dispute <addr> --seat 0 | " +
      "bun run bin/dev.js draw:seat --dispute <addr> --subaccord <addr> " +
      "--seat 0 --membership -",
  ];

  static flags = {
    ...chainFlags,
    dispute: Flags.string({ description: "The Dispute PDA", required: true }),
    round: Flags.integer({
      description: "Round index (sortition domain separator)",
      char: "r",
      default: 0,
    }),
    seat: Flags.integer({
      description: "Seat index within the round (0-based)",
      char: "s",
      required: true,
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
    const { flags } = await this.parse(DrawResolveSeat);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const tc = await loadDrawTree(ctx, parseAddress(flags.dispute, "dispute"));
    const membership = await resolveOneSeat(tc, flags.round, flags.seat, flags["draw-attempt"], []);
    const artifact = jsonStringify(membershipToJson(membership));

    if (flags.out !== "-") {
      // File sink: write the JSON artifact, print a short confirmation.
      writeOutput(flags.out, artifact);
      this.emitRead(
        { wrote: flags.out, seat: flags.seat, jurorStake: membership.jurorStake },
        {
          primary: membership.jurorStake,
          human: [
            `wrote ${flags.out}`,
            `  seat ${flags.seat} → ${membership.jurorStake} (retries=${membership.retries})`,
          ],
        },
      );
      return;
    }

    // Stdout sink: the JSON artifact IS the output (pipe to `draw:seat`).
    // `--quiet` collapses to the primary (the drawn juror's stake PDA).
    if (flags.quiet) {
      this.emitRead(membership, { primary: membership.jurorStake });
    } else {
      this.log(artifact);
    }
  }
}
