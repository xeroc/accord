/**
 * `useaccord config:balance` — SOL or SPL balance for any address.
 * SDK: `rpc.getBalance` (SOL) / `rpc.getTokenAccountBalance` (SPL via derived ATA).
 */
import { Args, Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { findAssociatedTokenAddress } from "@useaccord/sdk";
import { truncateAddress } from "../../lib/format.js";

export default class ConfigBalance extends ChainCommand {
  static summary = "SOL or SPL token balance for an address";

  static description =
    "Query the SOL balance (default) or an SPL token balance (--token-mint) for " +
    "any address. Defaults to the loaded wallet. For SPL, the associated token " +
    "account (ATA) is derived from the owner + mint.";

  static examples = [
    "<%= config.bin %> config:balance",
    "<%= config.bin %> config:balance 9aJb2…",
    "<%= config.bin %> config:balance --token-mint EPjFWd…",
  ];

  static flags = {
    ...chainFlags,
    "token-mint": Flags.string({
      description: "Mint of the SPL token whose ATA balance to read",
      char: "m",
    }),
  };

  static args = {
    address: Args.string({
      description: "Address to query (defaults to the loaded wallet)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigBalance);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const owner = (args.address as Address | undefined) ?? ctx.signer.address;

    if (flags["token-mint"]) {
      const ata = await findAssociatedTokenAddress(flags["token-mint"] as Address, owner);
      const { value } = await ctx.accord.rpc
        .getTokenAccountBalance(ata, { commitment: ctx.commitment })
        .send();
      this.emitRead(
        { owner, mint: flags["token-mint"], tokenAccount: ata, ...value },
        {
          primary: ata,
          human: [`${truncateAddress(owner)} → ${value.uiAmountString ?? value.amount}`],
        },
      );
      return;
    }

    const { value: lamports } = await ctx.accord.rpc
      .getBalance(owner, { commitment: ctx.commitment })
      .send();
    this.emitRead(
      { owner, balanceLamports: lamports, balanceSol: Number(lamports) / 1e9 },
      {
        primary: owner,
        human: [`${truncateAddress(owner)}: ${lamports} lamports (◎ ${Number(lamports) / 1e9})`],
      },
    );
  }
}
