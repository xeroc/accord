/**
 * `useaccord canon:challenge` — dispute a Canon item (canon `challenge_item`,
 * CPIs Accord `create_dispute` with the CanonList PDA as filer).
 * SDK: `@useaccord/canon` `challengeItem`.
 *
 * The loaded wallet is the challenger: pays `challenge_pct × accumulated_stake`
 * (fee_mint) plus the Accord panel fee into the list vault. Every derived
 * address comes from on-chain state — the item's list back-ref, the list's
 * fee_mint / subaccord / dispute_count. The dispute PDA is
 * `["dispute", list, dispute_count]` (the list is the filer, so the nonce is
 * the LIST's monotonic counter, not the item's).
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import {
  ACCORD_PROGRAM_ID,
  findAccordStatePda,
  findAssociatedTokenAddress,
  findDisputePda,
} from "@useaccord/sdk";
import { challengeItem } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolveItem } from "../../canon-context.js";
import { parseHash32 } from "../dispute/create.js";

const ZERO_EVIDENCE = new Uint8Array(32);

export default class CanonChallenge extends ChainCommand {
  static summary = "Challenge an item (CPIs an Accord dispute; list PDA is the filer)";

  static description =
    "Challenge a Pending/Listed/WithdrawPending item to an Accord keep-vs-remove " +
    "dispute. The challenger locks challenge_pct of the item's accumulated_stake " +
    "(fee_mint) into the list vault and pays the panel fee. After the ruling, " +
    "crank `canon:settle` to fold the outcome back into the item.";

  static examples = [
    "<%= config.bin %> canon:challenge --item <pda>",
    "<%= config.bin %> canon:challenge --item <pda> --evidence <hex64>",
  ];

  static flags = {
    ...chainFlags,
    item: Flags.string({ description: "CanonItem PDA address", required: true }),
    evidence: Flags.string({
      description: "Evidence commitment hash (32-byte hex). Defaults to 32 zero bytes",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonChallenge);
    this.applyOutput(flags);

    const evidence = flags.evidence ? parseHash32(flags.evidence, "evidence") : ZERO_EVIDENCE;

    const ctx = await this.loadChain(flags);
    const r = await resolveItem(ctx, flags.item as Address);
    const { list, listAddress, itemAddress } = r;

    // Accord-side CPI accounts — all derived, none guessed.
    const [dispute] = await findDisputePda({
      filer: listAddress,
      nonce: BigInt(list.disputeCount),
    });
    const [accordState] = await findAccordStatePda();
    const accordFeeVault = await findAssociatedTokenAddress(list.feeMint, list.subaccord);

    const challengerTokenAccount = await findAssociatedTokenAddress(
      list.feeMint,
      ctx.signer.address,
    );
    const vault = await findAssociatedTokenAddress(list.feeMint, listAddress);

    const instruction = challengeItem(
      {
        challenger: ctx.signer,
        list: listAddress,
        item: itemAddress,
        subaccord: list.subaccord,
        feeMint: list.feeMint,
        challengerTokenAccount,
        vault,
      },
      { evidence },
      {
        accordDispute: dispute,
        accordState,
        accordFeeVault,
        accordProgram: ACCORD_PROGRAM_ID,
      },
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      dispute,
      item: itemAddress,
      challengeStakeBps: list.challengePct,
    });
  }
}
