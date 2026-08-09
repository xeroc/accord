/**
 * `useaccord vote:commit` — juror commits `hash(vote, salt, juror)`.
 * SDK: `commit` (voting.ts:194).
 *
 * Single-signer model: the loaded `--keypair` wallet IS the drawn juror. The
 * commitment is computed client-side (`commitHash`) and sent on-chain; the
 * chain stores it until `reveal`. `--salt random` generates a fresh 32-byte
 * salt and prints it back (hex) so the exact pair can be re-supplied to
 * `vote:reveal`. `--salt-from <path>` reads the salt from a file (the hex
 * string written by a prior `--salt random` commit).
 *
 * Output: `{ signature, commitment, salt }` — `salt` is the 64-hex-char form
 * actually used (critical when `--salt random`).
 */
import { readFileSync } from "node:fs";

import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { Accord, findRoundPda, type VotingAccounts } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { decodeHexSalt, toHex } from "./commit-hash.js";

export default class VoteCommit extends ChainCommand {
  static summary = "Commit hash(vote, salt, juror) for the loaded juror (signer)";

  static description =
    "Build and send the juror's `commit` instruction: computes " +
    "sha256(vote ‖ salt ‖ signer_pubkey) client-side and writes it to the round. " +
    "The loaded wallet is the juror. Pass `--salt random` to generate a fresh " +
    "salt (it is echoed back so `vote:reveal` can reuse the exact pair); or " +
    "`--salt-from <file>` to read a previously-emitted salt.";

  static examples = [
    "<%= config.bin %> vote:commit --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --vote 1 --salt random",
    "<%= config.bin %> vote:commit --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --vote 0 --salt 0x0101…01",
    "<%= config.bin %> vote:commit --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --vote 1 --salt-from ./salt.txt",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({ description: "Subaccord PDA address", required: true }),
    dispute: Flags.string({ description: "Dispute PDA address", required: true }),
    "round-idx": Flags.integer({
      description: "Round index (u32) — the round PDA is derived from (dispute, round-idx)",
      required: true,
    }),
    vote: Flags.integer({
      description: "Vote option index (0..num_options)",
      required: true,
    }),
    salt: Flags.string({
      description: '32-byte salt as 64 hex chars, or the literal "random" to generate one',
      required: true,
    }),
    "salt-from": Flags.string({
      description: "Read the 64-hex-char salt from a file (overrides --salt)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VoteCommit);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [round] = await findRoundPda(
      { dispute: flags.dispute as Address, roundIdx: flags["round-idx"] },
      { programAddress: Accord.PROGRAM_ID },
    );

    const { salt, generated } = resolveSalt(flags.salt, flags["salt-from"]);
    const saltHex = toHex(salt);

    const accounts: VotingAccounts = {
      signer: ctx.signer.address,
      subaccord: flags.subaccord as Address,
      dispute: flags.dispute as Address,
      round,
    };

    const { instruction, commitment } = await ctx.accord.methods.commit(accounts, {
      vote: flags.vote,
      salt,
    });
    const commitmentHex = toHex(commitment);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      commitment: commitmentHex,
      salt: saltHex,
      round,
      saltGenerated: generated,
    });
  }
}

/**
 * Resolve the salt from `--salt` (hex|random) or `--salt-from <path>`. Returns
 * the 32 bytes plus a flag indicating whether a fresh salt was generated (so
 * the caller can surface it in the human output).
 */
export function resolveSalt(
  saltFlag: string,
  saltFrom?: string,
): { salt: Uint8Array; generated: boolean } {
  if (saltFrom) {
    const raw = readFileSync(saltFrom, "utf-8").trim();
    return { salt: decodeHexSalt(raw, "--salt-from"), generated: false };
  }
  if (saltFlag === "random") {
    return { salt: cryptoRandom32(), generated: true };
  }
  return { salt: decodeHexSalt(saltFlag, "--salt"), generated: false };
}

function cryptoRandom32(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}
