/**
 * `useaccord vote:commit-hash` — offline commit-hash derivation (pure).
 * SDK: `commitHash` (voting.ts:77).
 *
 * Computes `sha256(vote_byte ‖ salt[32] ‖ juror_pubkey[32])` — the exact digest
 * the on-chain `reveal` recomputes via `solana_program::hash::hashv` and checks
 * against the stored commitment. No chain, no signer: the canonical way to
 * preview a commit before sending, or to cross-check that `vote:commit` will
 * land the hash you expect.
 *
 * Output (`--json`): `{ commitment: "<64 hex chars>" }`.
 */
import { Flags } from "@oclif/core";
import { getAddressEncoder, type Address } from "@solana/kit";

import { commitHash } from "@useaccord/sdk";

import { BaseCommand, accordBaseFlags } from "../../lib/base-command.js";

export default class VoteCommitHash extends BaseCommand {
  static summary = "Compute the commit hash sha256(vote ‖ salt ‖ juror) — pure, offline";

  static description =
    "Derive the 32-byte commit commitment for a (vote, salt, juror) triple, " +
    "matching the on-chain `reveal` check bit-for-bit. No RPC, no keypair. Use " +
    "to preview a commit or verify your salt/vote pair before sending " +
    "`vote:commit`.";

  static examples = [
    "<%= config.bin %> vote:commit-hash --vote 1 --salt 0x0101…01 --juror 9aJb2…",
    "<%= config.bin %> vote:commit-hash --vote 0 --salt 0101…01 --juror 9aJb2… --json",
  ];

  static flags = {
    ...accordBaseFlags,
    vote: Flags.integer({
      description: "Vote option index (0..num_options)",
      required: true,
    }),
    salt: Flags.string({
      description: "32-byte salt as 64 hex chars (optional 0x prefix)",
      required: true,
    }),
    juror: Flags.string({
      description: "Juror pubkey (the signer that will commit/reveal)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VoteCommitHash);
    this.applyOutput(flags);

    const salt = decodeHexSalt(flags.salt, "--salt");
    const jurorBytes = new Uint8Array(getAddressEncoder().encode(flags.juror as Address));
    const commitment = await commitHash(flags.vote, salt, jurorBytes);
    const commitmentHex = toHex(commitment);

    this.emitRead(
      { commitment: commitmentHex, vote: flags.vote, salt: flags.salt, juror: flags.juror },
      {
        primary: commitmentHex,
        human: [`commitment: ${commitmentHex}`],
      },
    );
  }
}

/** Parse a 64-hex-char salt (with or without `0x` prefix) into 32 bytes. */
export function decodeHexSalt(value: string, label = "salt"): Uint8Array {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(
      `InvalidSalt (${label}): expected 64 hex chars (32 bytes), got ${clean.length} chars`,
    );
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Uint8Array → lowercase hex string (no `0x` prefix). */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
