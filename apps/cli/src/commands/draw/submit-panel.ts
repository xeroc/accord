/**
 * `useaccord draw:submit-panel` — submit the full panel's `draw_seat`
 * instructions in a loop (composite send). SDK: `methods.drawSeat` (vrf.ts).
 *
 * Either consume a `SeatMembership[]` JSON artifact from `draw:resolve-panel`
 * (`--membership <file|->`), OR run resolve-panel inline by passing
 * `--dispute`/`--round`/`--panel-size` without `--membership`. Sends one tx per
 * seat (1232B can't hold N proofs); the loaded wallet is `caller` for every tx.
 *
 * PROG-ATTESTTION: on credential-gated Subaccords each seat's juror SAS
 * attestation is resolved by content (`findSasAttestation`) and forwarded as
 * `remaining_accounts[1]`; a juror without an attestation under the pool's
 * (credential, schema) binding aborts the panel.
 *
 * Not a banned `flow:*` composite (CLI.md §7 Q4) — this is a legitimate
 * per-seat draw primitive.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";
import {
  fetchMaybeSubaccord,
  findSasAttestation,
  findRoundPda,
  panelSizeForRound,
  type SeatMembership,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { jsonStringify } from "../../lib/output.js";
import {
  bytesToAddress,
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
    "`caller` for every seat. On credential-gated Subaccords (PROG-ATTESTTION) " +
    "each seat's juror SAS attestation is discovered automatically. Use " +
    "`--dry-run` to inspect each built instruction.";

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
    "from-seat": Flags.integer({
      description:
        "Resume from this seat index (skip already-drawn seats — e.g. after a " +
        "partial panel submission; default 0)",
      default: 0,
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
    let panel: SeatMembership[];
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

    // 2) PROG-ATTESTTION: on credential-gated Subaccords every draw_seat needs
    //    its juror's SAS attestation as remaining_accounts[1]. Resolve the gate
    //    once, then discover each seat's attestation by content.
    const ZERO = "11111111111111111111111111111111" as Address;
    const sub = await fetchMaybeSubaccord(ctx.accord.rpc, subaccord);
    if (!sub.exists) {
      this.error(`Subaccord ${flags.subaccord} not found`, { exit: 1 });
    }
    const gated = sub.data.jurorCredential !== ZERO;
    if (
      !Number.isInteger(flags["from-seat"]) ||
      flags["from-seat"] < 0 ||
      flags["from-seat"] >= panel.length
    ) {
      this.error(
        `--from-seat must be a seat index in [0, ${panel.length}) (got ${flags["from-seat"]})`,
        { exit: 1 },
      );
    }

    // 3) Send one draw_seat per seat (one tx each — proofs don't fit in one).
    const [roundPda] = await findRoundPda({
      dispute,
      roundIdx: flags.round,
    });
    const signatures: string[] = [];
    const submittedSeats: number[] = [];
    for (let seat = flags["from-seat"]; seat < panel.length; seat++) {
      const membership = panel[seat]!;
      let attestation: Address | undefined;
      if (gated) {
        const juror = bytesToAddress(membership.leaf.juror);
        const found = await findSasAttestation(ctx.accord.rpc, {
          credential: sub.data.jurorCredential,
          schema: sub.data.jurorSchema,
          juror,
        });
        if (found === null) {
          this.error(
            `seat ${seat}: no SAS attestation found for juror ${juror} under the ` +
              `Subaccord's (credential, schema) binding — cannot draw on a gated pool ` +
              `(prune or re-credential the juror)`,
            { exit: 1 },
          );
        }
        attestation = found;
      }
      const instruction = ctx.accord.methods.drawSeat(
        {
          caller: ctx.signer.address,
          subaccord,
          dispute,
        },
        roundPda,
        seat,
        membership,
        attestation,
      );

      if (flags["dry-run"]) {
        this.emitDryRun(instruction);
        continue;
      }
      signatures.push(await this.sendInstruction(ctx, instruction));
      submittedSeats.push(seat);
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
      lines.push(`  seat ${submittedSeats[i]}: ${signatures[i]}`);
    }
    lines.push(`  round ${flags.round}, panel ${panel.length}`);
    this.log(lines.join("\n"));
  }
}
