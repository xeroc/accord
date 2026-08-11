/**
 * `useaccord read:subaccord <addr>` — fetch + decode a Subaccord account.
 * SDK: `fetchMaybeSubaccord`. Missing account ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeSubaccord, type Subaccord } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { truncateAddress } from "../../lib/format.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadSubaccord extends ChainCommand {
  static summary = "Fetch + decode a Subaccord account";

  static description =
    "Read a Subaccord by its on-chain address. Decodes creator, staking/fee " +
    "mints, economics (min_stake, alpha, windows), and panel config. Missing " +
    "account returns {exists:false} (exit 0), not an error.";

  static examples = [
    "<%= config.bin %> read:subaccord AaNWS…XVG9",
    "<%= config.bin %> read:subaccord <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({
      description: "Subaccord account address",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(ReadSubaccord);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeSubaccord(ctx.accord.rpc, args.address as Address);
    // PROG-ATTESTTION: name the credential gate so a `1111…1111` pair reads as
    // "stake-only" instead of an opaque address (the raw fields still print above).
    const gateHuman = maybe.exists ? [subaccordGateLine(maybe.data)] : [];
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "subaccord", gateHuman);
  }
}

/** `Pubkey::default()` (stake-only sentinel) — matches the SDK adapter default. */
const ZERO_PUBKEY = "11111111111111111111111111111111";

/**
 * PROG-ATTESTTION gate summary for the human read. Omitted/zero pair ⇒
 * stake-only; otherwise the credential issuer + schema the juror's SAS
 * attestation must satisfy to stake and be drawn.
 */
function subaccordGateLine(data: Subaccord): string {
  const stakeOnly =
    data.jurorCredential === ZERO_PUBKEY && data.jurorSchema === ZERO_PUBKEY;
  const value = stakeOnly
    ? "stake-only"
    : `credential-gated (credential=${truncateAddress(data.jurorCredential)}, ` +
      `schema=${truncateAddress(data.jurorSchema)})`;
  return `  ${"gate".padEnd(18)}: ${value}`;
}
