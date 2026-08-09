/**
 * `useaccord dispute:cancel` — permissionless timeout exit: refund the filer's
 * round-1 fee when a dispute stalls. SDK: `methods.cancelDispute`
 * (methods/settlement.ts:89). ChainCommand (sends).
 *
 * `--remaining-accounts auto` (default) derives the Round + JurorStake +
 * AppealBond PDAs the handler closes/refunds by reading the Dispute + each
 * Round's drawn jurors. `list` takes an explicit comma-separated address set
 * for advanced / partial refunds.
 */
import { Args, Flags } from "@oclif/core";
import type { Address, Commitment, Rpc, SolanaRpcApi } from "@solana/kit";

import {
  fetchMaybeAppealBond,
  fetchMaybeDispute,
  fetchMaybeRound,
  fetchMaybeSubaccord,
  findAppealBondPda,
  findJurorStakePda,
  findRoundPda,
  type Dispute,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

// Well-known SPL addresses (not exported by @solana/kit v7).
const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const ATA_PROGRAM_ADDRESS = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/** Derive the Associated Token Account for `mint` owned by `owner`. */
async function deriveAta(mint: Address, owner: Address): Promise<Address> {
  const { getAddressEncoder, getProgramDerivedAddress } = await import("@solana/kit");
  const [ata] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM_ADDRESS,
    seeds: [
      getAddressEncoder().encode(owner),
      getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS),
      getAddressEncoder().encode(mint),
    ],
  });
  return ata;
}

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
  const feeVault = await deriveAta(feeToken, subaccord);
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
    const filerTokenAccount = await deriveAta(econs.feeToken, filer);

    const remaining =
      flags["remaining-accounts"] === "list"
        ? parseAddressList(flags.remaining)
        : await autoDeriveRemaining(
            ctx.accord.rpc,
            dispute,
            subaccord,
            data.currentRound,
            ctx.commitment,
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

/**
 * Derive the Round + JurorStake + AppealBond PDAs `cancel_dispute` closes/refunds.
 * Rounds 0..=currentRound that exist contribute their drawn jurors' JurorStake
 * PDAs; each round also contributes an AppealBond PDA if one was posted.
 * Dedup preserves first-seen order (stable for --dry-run diffs).
 */
async function autoDeriveRemaining(
  rpc: Rpc<SolanaRpcApi>,
  dispute: Address,
  subaccord: Address,
  currentRound: number,
  commitment: Commitment,
): Promise<Address[]> {
  const out: Address[] = [];
  const seen = new Set<string>();

  const push = (addr: Address): void => {
    if (!seen.has(addr)) {
      seen.add(addr);
      out.push(addr);
    }
  };

  for (let r = 0; r <= currentRound; r++) {
    const [roundPda] = await findRoundPda({ dispute, roundIdx: r });
    push(roundPda);
    const round = await fetchMaybeRound(rpc, roundPda, { commitment });
    if (!round.exists) continue;
    for (const juror of round.data.jurors) {
      const [stakePda] = await findJurorStakePda({ subaccord, juror });
      push(stakePda);
    }
    const [bondPda] = await findAppealBondPda({ dispute, roundIdx: r });
    const bond = await fetchMaybeAppealBond(rpc, bondPda, { commitment });
    if (bond.exists) push(bondPda);
  }
  return out;
}
