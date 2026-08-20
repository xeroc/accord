/**
 * `useaccord canon:create-list` — permissionless CanonList creation
 * (canon lib.rs `create_list`). SDK: `@useaccord/canon` `createList`.
 *
 * Inits the CanonList PDA `["canon", creator, rules_hash]` and CPIs Accord
 * `create_subaccord` for the 1:1 backing court (`domain_ref := rules_hash`).
 * The loaded wallet is the fee payer and list creator. `rules_hash` is the
 * public listing-criteria hash and a seed component — pass `--random-rules-hash`
 * on dev so two runs don't collide on the same PDA. The on-chain guard rejects
 * an all-zero rules_hash and a default (zero) evidence operator.
 */
import { Flags } from "@oclif/core";
import { randomBytes } from "node:crypto";
import { type Address } from "@solana/kit";

import { createList, defaultCourtParams } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { parseHash32 } from "../dispute/create.js";
import { parseLamports } from "../dispute/required-fee.js";

/** Sentinel `Pubkey::default()` — disables the item ownership gate. */
const ANY_LIST_PROGRAM = "11111111111111111111111111111111";

/** Canonical court profile — court-flag defaults derive from it (ADR
 * canon/0002: defaults are caller-side; power users override per flag). */
const DEFAULT_COURT = defaultCourtParams();

/** Resolve `--rules-hash`: omit/'random' flag → fresh 32 bytes; else parse hex. */
export function resolveRulesHash(random: boolean, raw?: string): Uint8Array {
  if (random) return new Uint8Array(randomBytes(32));
  return parseHash32(raw ?? "", "RulesHash");
}

export default class CanonCreateList extends ChainCommand {
  static summary = "Create a Canon curated list (+ its 1:1 backing Subaccord)";

  static description =
    "Permissionlessly create a CanonList — a token-agnostic curated list " +
    "whose item disputes are adjudicated by a dedicated backing Subaccord " +
    "(CPI `create_subaccord`; `domain_ref := rules_hash`). `rules_hash` + " +
    "`list_program` are immutable; the economics (submit_deposit, " +
    "challenge_pct, windows) are frozen at creation. The backing court " +
    "profile defaults to the SDK canonical profile (`defaultCourtParams()`); " +
    "override per `--min-stake`/`--alpha-bps`/… flag — `--min-jury-size` and " +
    "`--depth` are immutable once set. The loaded wallet is the list " +
    "creator + fee payer.";

  static examples = [
    "<%= config.bin %> canon:create-list --random-rules-hash \\\n" +
      "  --stake-mint <mint> --fee-mint <mint> --submit-deposit 500 \\\n" +
      "  --challenge-pct 5000 --listing-window 432000 --withdrawal-timelock 432000 \\\n" +
      "  --evidence-operator <addr>",
    "<%= config.bin %> canon:create-list --rules-hash <hex64> --stake-mint <mint> \\\n" +
      "  --fee-mint <mint> --submit-deposit 500 --challenge-pct 5000 \\\n" +
      "  --listing-window 432000 --withdrawal-timelock 432000 \\\n" +
      "  --evidence-operator <addr>  # same mints ⇒ single-mint economics",
    "<%= config.bin %> canon:create-list --random-rules-hash \\\n" +
      "  --stake-mint <mint> --fee-mint <mint> --submit-deposit 500 \\\n" +
      "  --challenge-pct 5000 --listing-window 432000 --withdrawal-timelock 432000 \\\n" +
      "  --evidence-operator <addr> --min-jury-size 5 --fee-per-juror 25 \\\n" +
      "  --alpha-bps 500  # court override; unset flags stay canonical",
  ];

  static flags = {
    ...chainFlags,
    "random-rules-hash": Flags.boolean({
      description: "Generate a fresh random 32-byte rules_hash (dev: avoids PDA collisions)",
      default: false,
    }),
    "rules-hash": Flags.string({
      description: "Listing-criteria doc hash as 64 hex chars (immutable; Subaccord domain_ref)",
    }),
    "stake-mint": Flags.string({
      description: "Juror collateral mint (backing Subaccord staking_token, ADR-0020)",
      required: true,
    }),
    "fee-mint": Flags.string({
      description:
        "Registry economics mint — deposits, bounties, Accord fees (may equal --stake-mint)",
      required: true,
    }),
    "list-program": Flags.string({
      description:
        "Program that must own a curated `account` at submit " +
        "(default: sentinel — ownership gate off, curate arbitrary addresses)",
      default: ANY_LIST_PROGRAM,
    }),
    "submit-deposit": Flags.string({
      description: "Permanent skin locked at submit, in base units of the fee mint",
      required: true,
    }),
    "challenge-pct": Flags.integer({
      description: "Challenger stake as bps of the item's accumulated_stake (≤ 10000)",
      required: true,
    }),
    "listing-window": Flags.string({
      description: "Seconds an item sits Pending before auto-listing if unchallenged",
      required: true,
    }),
    "withdrawal-timelock": Flags.string({
      description: "Seconds the WithdrawPending challenge window stays open",
      required: true,
    }),
    "evidence-operator": Flags.string({
      description: "Backing court's evidence operator (Ed25519 pubkey; not the default key)",
      required: true,
    }),
    "min-stake": Flags.string({
      description: "Court: juror draw-eligibility threshold, base units of the stake mint",
      default: DEFAULT_COURT.minStake.toString(),
    }),
    "alpha-bps": Flags.integer({
      description: "Court: slash factor in bps (≤ 10000)",
      default: DEFAULT_COURT.alphaBps,
    }),
    "review-window": Flags.string({
      description: "Court: seconds a round spends in review (> 0)",
      default: DEFAULT_COURT.reviewWindow.toString(),
    }),
    "commit-window": Flags.string({
      description: "Court: seconds jurors get to commit (> 0)",
      default: DEFAULT_COURT.commitWindow.toString(),
    }),
    "reveal-window": Flags.string({
      description: "Court: seconds jurors get to reveal (> 0)",
      default: DEFAULT_COURT.revealWindow.toString(),
    }),
    "appeal-window": Flags.string({
      description: "Court: appeal window after a round resolves (Accord floor: 1h)",
      default: DEFAULT_COURT.appealWindow.toString(),
    }),
    "max-appeals": Flags.integer({
      description: "Court: max appeals per dispute; ladder (J+1)·2^k − 1 must fit MAX_JURORS",
      default: DEFAULT_COURT.maxAppeals,
    }),
    "min-jury-size": Flags.integer({
      description: "Court: round-1 juror panel size; odd; immutable on the Subaccord",
      default: DEFAULT_COURT.minJurySize,
    }),
    "fee-per-juror": Flags.string({
      description: "Court: per-juror fee, base units of the fee mint",
      default: DEFAULT_COURT.feePerJuror.toString(),
    }),
    "reveal-threshold-bps": Flags.integer({
      description: "Court: reveal-quorum fraction in bps (ADR-0021; ≤ 10000)",
      default: DEFAULT_COURT.revealThresholdBps,
    }),
    "max-draw-attempts": Flags.integer({
      description: "Court: max same-size redraws per round (ADR-0021)",
      default: DEFAULT_COURT.maxDrawAttempts,
    }),
    depth: Flags.integer({
      description: "Court: MST accumulator depth (≤ 8); immutable on the Subaccord",
      default: DEFAULT_COURT.depth,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonCreateList);
    this.applyOutput(flags);

    const rulesHash = resolveRulesHash(flags["random-rules-hash"], flags["rules-hash"]);

    const ctx = await this.loadChain(flags);

    const court = {
      minStake: parseLamports(flags["min-stake"], "MinStake"),
      alphaBps: flags["alpha-bps"],
      reviewWindow: parseLamports(flags["review-window"], "ReviewWindow"),
      commitWindow: parseLamports(flags["commit-window"], "CommitWindow"),
      revealWindow: parseLamports(flags["reveal-window"], "RevealWindow"),
      appealWindow: parseLamports(flags["appeal-window"], "AppealWindow"),
      maxAppeals: flags["max-appeals"],
      minJurySize: flags["min-jury-size"],
      feePerJuror: parseLamports(flags["fee-per-juror"], "FeePerJuror"),
      revealThresholdBps: flags["reveal-threshold-bps"],
      maxDrawAttempts: flags["max-draw-attempts"],
      depth: flags["depth"],
    };
    const { instruction, list, subaccord } = await createList(
      {
        creator: ctx.signer,
        stakeMint: flags["stake-mint"] as Address,
        feeMint: flags["fee-mint"] as Address,
      },
      {
        listProgram: flags["list-program"] as Address,
        rulesHash,
        submitDeposit: parseLamports(flags["submit-deposit"], "SubmitDeposit"),
        challengePct: flags["challenge-pct"],
        listingWindow: parseLamports(flags["listing-window"], "ListingWindow"),
        withdrawalTimelock: parseLamports(flags["withdrawal-timelock"], "WithdrawalTimelock"),
        evidenceOperator: flags["evidence-operator"] as Address,
        court,
      },
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { list, subaccord });
  }
}
