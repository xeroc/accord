/**
 * `useaccord settle:round` — permissionless per-round settlement crank
 * (lib.rs `settle_round`). SDK: `methods.settleRound`.
 *
 * After a dispute reaches `Final`, prior-round jurors are still pinned with
 * `active_draws > 0`. This crank settles one prior round against the final
 * ruling: slashes incoherent jurors, redistributes the fee pool, and releases
 * the drawn seats. Coherence is judged against `dispute.final_ruling`, not the
 * round's own result.
 *
 * `--remaining-accounts auto` (default) fetches the Round account and derives
 * the panel's `JurorStake` PDAs (`["stake", subaccord, juror]` per drawn seat),
 * matching the on-chain remaining_accounts contract (lib.rs:1574). `list`
 * takes explicit `--juror-stake` addresses instead. The `Round` PDA itself is
 * derived from `dispute + round-idx` unless `--round` overrides it.
 */
import { Flags } from "@oclif/core";
import type { Address } from "@solana/kit";

import { fetchMaybeRound, findJurorStakePda, findRoundPda } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

/** Kit RPC shape expected by the generated account fetchers. */
type FetchRpc = Parameters<typeof fetchMaybeRound>[0];

export default class SettleRound extends ChainCommand {
  static summary = "Per-round settlement crank (release prior-round jurors)";

  static description =
    "Permissionless crank that settles a single prior round's coherence " +
    "economics after the dispute is Final: slashes incoherent jurors, " +
    "redistributes the fee pool, and releases the drawn seats. One call per " +
    "round (`round_idx < dispute.current_round`). " +
    "Coherence is judged against `dispute.final_ruling`.";

  static examples = [
    "<%= config.bin %> settle:round --subaccord <addr> --dispute <addr> --round-idx 0",
    "<%= config.bin %> settle:round --subaccord <addr> --dispute <addr> --round-idx 0 --remaining-accounts list --juror-stake <pda1> --juror-stake <pda2> --juror-stake <pda3>",
    "<%= config.bin %> settle:round --subaccord <addr> --dispute <addr> --round-idx 0 --dry-run",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA address",
      required: true,
    }),
    dispute: Flags.string({
      description: "Dispute PDA address (must be in Final state)",
      required: true,
    }),
    "round-idx": Flags.integer({
      description: "Prior round index to settle (< dispute.current_round)",
      required: true,
    }),
    round: Flags.string({
      description: "Round PDA address (derived from dispute + round-idx if omitted)",
    }),
    "remaining-accounts": Flags.string({
      description:
        "'auto' (default) derives the panel JurorStake PDAs from the round; " +
        "'list' uses the explicit --juror-stake addresses",
      options: ["auto", "list"],
      default: "auto",
    }),
    "juror-stake": Flags.string({
      description:
        "Explicit JurorStake PDA addresses (one per drawn seat; required with --remaining-accounts list)",
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SettleRound);
    this.applyOutput(flags);

    if (flags["round-idx"] < 0) {
      this.error("--round-idx must be >= 0", { exit: 1 });
    }

    const ctx = await this.loadChain(flags);

    const subaccord = flags.subaccord as Address;
    const dispute = flags.dispute as Address;

    // Resolve the Round PDA: explicit override, else derive from dispute + idx.
    const roundAddress: Address = flags.round
      ? (flags.round as Address)
      : (await findRoundPda({ dispute, roundIdx: flags["round-idx"] }))[0];

    // Resolve remaining_accounts: the drawn JurorStake PDAs (one per seat).
    let remainingAccounts: Address[];
    if (flags["remaining-accounts"] === "list") {
      const explicit = flags["juror-stake"] ?? [];
      if (explicit.length === 0) {
        this.error("--remaining-accounts list requires one or more --juror-stake addresses", {
          exit: 1,
        });
      }
      remainingAccounts = explicit as Address[];
    } else {
      remainingAccounts = await this.derivePanel(ctx.accord.rpc, subaccord, roundAddress);
    }

    const instruction = ctx.accord.methods.settleRound(
      {
        caller: ctx.signer.address,
        subaccord,
        dispute,
        round: roundAddress,
      },
      flags["round-idx"],
      remainingAccounts,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      round: roundAddress,
      roundIdx: flags["round-idx"],
      panel: remainingAccounts.length,
    });
  }

  /**
   * Derive the panel's JurorStake PDAs for `--remaining-accounts auto`: fetch
   * the round, take the first `jurorCount` seats, and derive each juror's
   * stake PDA (`["stake", subaccord, juror]`).
   *
   * ponytail: inline — when vote:finalize-round lands, propose promoting this
   * to a shared lib helper (same panel set, milestone accord-43co).
   */
  private async derivePanel(
    rpc: FetchRpc,
    subaccord: Address,
    roundAddress: Address,
  ): Promise<Address[]> {
    const round = await fetchMaybeRound(rpc, roundAddress);
    if (!round.exists) {
      this.error(`Round account not found: ${roundAddress} (derive it or pass --round)`, {
        exit: 1,
      });
    }
    const { jurorCount, jurors } = round.data;
    const drawn = jurors.slice(0, jurorCount);
    const pdas = await Promise.all(drawn.map((juror) => findJurorStakePda({ subaccord, juror })));
    return pdas.map((pda) => pda[0]);
  }
}
