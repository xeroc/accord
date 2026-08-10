/**
 * `useaccord config:show` — print the resolved CLI environment + payer balance.
 * Validates the chain context (rpc, keypair, program) end-to-end; the natural
 * "does my config work?" smoke command. SDK: `new Accord(...)` + `rpc.getBalance`.
 */
import { Accord } from "@useaccord/sdk";

import { ChainCommand } from "../../lib/base-command.js";
import { groupBigInt, truncateAddress } from "../../lib/format.js";
import { resolveKeypairPath } from "../../lib/wallet.js";

export default class ConfigShow extends ChainCommand {
  static summary = "Print resolved rpc, keypair, program id, and payer SOL balance";

  static description =
    "Resolves the active configuration from flags + env ($ACCORD_RPC_URL, " +
    "$ANCHOR_WALLET / $ACCORD_KEYPAIR_PATH) and queries the payer's SOL balance. " +
    "Use this to confirm the CLI can reach the validator and load the wallet.";

  static examples = ["<%= config.bin %> config:show"];

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigShow);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const { value: lamports } = await ctx.accord.rpc
      .getBalance(ctx.signer.address, { commitment: ctx.commitment })
      .send();

    const walletPath = resolveKeypairPath(flags.keypair);
    const data = {
      rpc: flags.rpc,
      walletPath,
      authority: ctx.signer.address,
      programId: Accord.PROGRAM_ID,
      commitment: ctx.commitment,
      balanceLamports: lamports,
      balanceSol: Number(lamports) / 1e9,
    };

    this.emitRead(data, {
      primary: ctx.signer.address,
      human: [
        `rpc        : ${flags.rpc}`,
        `keypair    : ${walletPath}`,
        `authority  : ${truncateAddress(ctx.signer.address)}`,
        `programId  : ${truncateAddress(Accord.PROGRAM_ID)}`,
        `commitment : ${ctx.commitment}`,
        `balance    : ${groupBigInt(lamports)} lamports (◎ ${data.balanceSol})`,
      ],
    });
  }
}
