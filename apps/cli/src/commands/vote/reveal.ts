/**
 * `useaccord vote:reveal` — juror reveals `{vote, salt}`; chain re-derives the
 * hash and credits participation. SDK: `reveal` (voting.ts:219).
 *
 * The `--vote`/`--salt` pair MUST match the prior `vote:commit` exactly — the
 * chain recomputes `sha256(vote ‖ salt ‖ juror)` and rejects a mismatch.
 * `--salt random` / `--salt-from` work the same as on `commit` (handy when you
 * saved the generated salt). `reveal` pays the participation fee, so it takes
 * the staking token + the juror's ATA + the subaccord vault ATA. `--vault` is
 * auto-derivable from `(staking-token, subaccord)` when omitted.
 */
import { Flags } from "@oclif/core";
import { getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";

import { Accord, findRoundPda, type VotingAccounts } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolveSalt } from "./commit.js";
import { toHex } from "./commit-hash.js";

// Fixed SPL program ids (not exported by @solana/kit v7).
const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const ATA_PROGRAM_ADDRESS = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

export default class VoteReveal extends ChainCommand {
  static summary = "Reveal {vote, salt} for the loaded juror (signer)";

  static description =
    "Build and send the juror's `reveal` instruction. The (vote, salt) pair must " +
    "match the prior `vote:commit` — the chain recomputes the commit hash and " +
    "rejects any mismatch. Pays the participation fee from the subaccord vault " +
    "to the juror's ATA. `--vault` defaults to the subaccord's ATA of the " +
    "staking token (auto-derived).";

  static examples = [
    "<%= config.bin %> vote:reveal --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --vote 1 --salt 0x0101…01 --staking-token EPjF… --juror-token-account 7vv…",
    "<%= config.bin %> vote:reveal --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --vote 1 --salt-from ./salt.txt --staking-token EPjF… --juror-token-account 7vv…",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({ description: "Subaccord PDA address", required: true }),
    dispute: Flags.string({ description: "Dispute PDA address", required: true }),
    "round-idx": Flags.integer({
      description: "Round index (u32) — the round PDA is derived from (dispute, round-idx)",
      required: true,
    }),
    vote: Flags.integer({ description: "Vote option index (must match commit)", required: true }),
    salt: Flags.string({
      description: '32-byte salt (64 hex) or "random" — must match the commit pair',
      required: true,
    }),
    "salt-from": Flags.string({
      description: "Read the 64-hex-char salt from a file (overrides --salt)",
    }),
    "staking-token": Flags.string({
      description: "Staking mint (fee denomination)",
      required: true,
    }),
    "juror-token-account": Flags.string({
      description: "Juror's ATA of the staking token (fee destination)",
      required: true,
    }),
    vault: Flags.string({
      description: "Subaccord vault ATA of the staking token (default: auto-derived)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VoteReveal);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [round] = await findRoundPda(
      { dispute: flags.dispute as Address, roundIdx: flags["round-idx"] },
      { programAddress: Accord.PROGRAM_ID },
    );

    const { salt } = resolveSalt(flags.salt, flags["salt-from"]);

    const vault =
      (flags.vault as Address | undefined) ??
      (await deriveAta(flags.subaccord as Address, flags["staking-token"] as Address));

    const accounts: VotingAccounts = {
      signer: ctx.signer.address,
      subaccord: flags.subaccord as Address,
      dispute: flags.dispute as Address,
      round,
      stakingToken: flags["staking-token"] as Address,
      jurorTokenAccount: flags["juror-token-account"] as Address,
      vault,
    };

    const instruction = ctx.accord.methods.reveal(accounts, {
      vote: flags.vote,
      salt,
    });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { round, salt: toHex(salt) });
  }
}

/** Derive the associated token account (ATA) address for (owner, mint). */
export async function deriveAta(owner: Address, mint: Address): Promise<Address> {
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
