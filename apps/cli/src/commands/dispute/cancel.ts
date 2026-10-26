/**
 * `useaccord dispute:cancel` — permissionless timeout exit: refund the filer's
 * round-1 fee when a dispute stalls. SDK: `methods.cancelDispute`
 * (methods/settlement.ts:89). ChainCommand (sends).
 *
 * `--remaining-accounts auto` (default) derives the remainingAccounts layout
 * via the SDK's deriveCancelDisputeRemainingAccounts (current Round + panel,
 * prior rounds + panels, AppealBonds — the handler's strict accounting
 * rejects any other shape). `list` takes an explicit comma-separated address
 * set for advanced / partial refunds.
 */
import { Args, Flags } from "@oclif/core";
import type { Address, Commitment, Rpc, SolanaRpcApi } from "@solana/kit";

import {
  Accord,
  deriveCancelDisputeRemainingAccounts,
  fetchMaybeDispute,
  fetchMaybeSubaccord,
  findAssociatedTokenAddress,
  type Dispute,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

/** Fetch the Subaccord's fee economics (feeToken + feeVault ATA + feePerJuror). */
async function readSubaccordEcons(
  rpc: Rpc<SolanaRpcApi>,
  subaccord: Address,
  commitment: Commitment,
): Promise<{ feeToken: Address; feeVault: Address }> {
  const account = await fetchMaybeSubaccord(rpc, subaccord, { commitment });
  if (!account.exists) {
    throw new Error(`SubaccordNotFound: ${subaccord}`);
  }
  const feeToken = account.data.feeToken;
  const feeVault = await findAssociatedTokenAddress(feeToken, subaccord);
  return { feeToken, feeVault };
}

export default class DisputeCancel extends ChainCommand {
  static summary = "Cancel a stalled dispute and refund the filer's fee (permissionless)";

  static description =
    "Permissionless crank that transitions a dispute to Failed and refunds the " +
    "filer's round-1 fee when a round times out without a ruling. " +
    "--remaining-accounts auto (default) derives the Round/JurorStake/AppealBond " +
    "set from on-chain state; pass list + --remaining for an explicit set.";

  static examples = [
    "<%= config.bin %> dispute:cancel <dispute-pda>",
    "<%= config.bin %> dispute:cancel <dispute-pda> --remaining-accounts list --remaining <addr>,<addr>",
  ];

  static args = {
    dispute: Args.string({ description: "Dispute PDA to cancel", required: true }),
  };

  static flags = {
    ...chainFlags,
    "remaining-accounts": Flags.string({
      description: "How to source remaining accounts: auto (derive) | list (explicit)",
      options: ["auto", "list"],
      default: "auto",
    }),
    remaining: Flags.string({
      description: "Comma-separated remaining-account addresses (with --remaining-accounts list)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DisputeCancel);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const caller = ctx.signer.address;
    const dispute = args.dispute as Address;

    // Dispute → subaccord + filer + currentRound; Subaccord → feeToken + feeVault.
    const d = await fetchMaybeDispute(ctx.accord.rpc, dispute, { commitment: ctx.commitment });
    if (!d.exists) {
      throw new Error(`DisputeNotFound: ${dispute}`);
    }
    const data: Dispute = d.data;
    const subaccord = data.subaccord;
    const filer = data.filer;
    const econs = await readSubaccordEcons(ctx.accord.rpc, subaccord, ctx.commitment);
    const filerTokenAccount = await findAssociatedTokenAddress(econs.feeToken, filer);

    const remaining =
      flags["remaining-accounts"] === "list"
        ? parseAddressList(flags.remaining)
        : await deriveCancelDisputeRemainingAccounts(
            ctx.accord.rpc,
            Accord.PROGRAM_ID as Address,
            dispute,
            subaccord,
            data.currentRound,
            data.drawnSeats,
          );

    const instruction = ctx.accord.methods.cancelDispute(
      {
        caller,
        subaccord,
        dispute,
        feeToken: econs.feeToken,
        filerTokenAccount,
        feeVault: econs.feeVault,
      },
      remaining,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { dispute, remainingAccounts: remaining.length });
  }
}

/** Split a comma-separated address list, validating non-empty. */
function parseAddressList(raw: string | undefined): Address[] {
  if (!raw) {
    throw new Error(
      "MissingRemaining: --remaining <addr,..> is required with --remaining-accounts list",
    );
  }
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list.length === 0) {
    throw new Error("MissingRemaining: --remaining produced an empty address list");
  }
  return list as Address[];
}

