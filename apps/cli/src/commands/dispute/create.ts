/**
 * `useaccord dispute:create` — file a Dispute against a Subaccord.
 * SDK: `methods.createDispute` (methods/dispute.ts:203). ChainCommand (sends).
 *
 * The loaded `--keypair` wallet is the filer (fee payer + fee source + the
 * signing account the adapter pins). `--fee auto` (default) fetches the
 * Subaccord's `feePerJuror` and computes `requiredFee` (= 3 · fee_per_juror);
 * `--fee <lamports>` skips the fetch when paired with `--fee-token` (enables
 * offline `--dry-run`). `emitCreated(dispute, { bump })`.
 */
import { Flags } from "@oclif/core";
import { randomBytes } from "node:crypto";
import type { Address, Commitment, Rpc, SolanaRpcApi } from "@solana/kit";

import {
  fetchMaybeSubaccord,
  findAssociatedTokenAddress,
  findPauseStatePda,
  requiredFee,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { parseLamports } from "./required-fee.js";

const ZERO_EVIDENCE = new Uint8Array(32);

/** Fetch the Subaccord's fee economics (feeToken + feeVault ATA + feePerJuror). */
async function readSubaccordEcons(
  rpc: Rpc<SolanaRpcApi>,
  subaccord: Address,
  commitment: Commitment,
): Promise<{ feeToken: Address; feeVault: Address; feePerJuror: bigint; minJurySize: number }> {
  const account = await fetchMaybeSubaccord(rpc, subaccord, { commitment });
  if (!account.exists) {
    throw new Error(
      `SubaccordNotFound: ${subaccord} (create it first via lifecycle:create-subaccord)`,
    );
  }
  const feeToken = account.data.feeToken;
  const feeVault = await findAssociatedTokenAddress(feeToken, subaccord);
  return {
    feeToken,
    feeVault,
    feePerJuror: account.data.feePerJuror,
    minJurySize: account.data.minJurySize,
  };
}

export default class DisputeCreate extends ChainCommand {
  static summary = "File a Dispute against a Subaccord (filer pays the full panel fee)";

  static description =
    "File a new Dispute. The loaded wallet is the filer and fee payer. Options " +
    "are 2..32 off-chain label hashes (each 32 bytes). The Dispute PDA is " +
    "derived from [filer, nonce], so a fresh nonce yields a fresh dispute. " +
    "Fee defaults to `auto` (3 × the Subaccord's feePerJuror); pass an explicit " +
    "lamports value with --fee-token to skip the on-chain read (--dry-run friendly).";

  static examples = [
    "<%= config.bin %> dispute:create --subcord <pda> --options <hex32>,<hex32>",
    "<%= config.bin %> dispute:create --subcord <pda> --options <a>,<b> --fee auto",
    "<%= config.bin %> dispute:create --subcord <pda> --options <a>,<b> --fee 3_000_000 --fee-token <mint> --dry-run",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA to file the dispute against",
      required: true,
    }),
    options: Flags.string({
      description: "Comma-separated 32-byte option label hashes (hex; 2..32)",
      required: true,
    }),
    nonce: Flags.string({
      description: "Dispute nonce (u64). Omit / 'random' for a random u64",
    }),
    fee: Flags.string({
      description: "Filing fee in lamports, or 'auto' (default) to derive from the Subaccord",
      default: "auto",
    }),
    "fee-token": Flags.string({
      description:
        "Fee token mint (overrides the Subaccord's feeToken; enables --dry-run with explicit --fee)",
    }),
    evidence: Flags.string({
      description: "Evidence commitment hash (32-byte hex; ADR-0006). Defaults to 32 zero bytes",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DisputeCreate);
    this.applyOutput(flags);

    const options = parseOptions(flags.options);
    const evidence = flags.evidence ? parseHash32(flags.evidence, "evidence") : ZERO_EVIDENCE;
    const nonce = resolveNonce(flags.nonce);

    const ctx = await this.loadChain(flags);
    const filer = ctx.signer.address;

    // Fee + fee-token resolution: explicit fee + fee-token avoids the RPC read
    // (offline --dry-run); otherwise fetch the Subaccord's economics.
    let fee: bigint;
    let feeToken: Address;
    if (flags.fee !== "auto") {
      fee = parseLamports(flags.fee, "Fee");
      if (!flags["fee-token"]) {
        // Need the mint even with an explicit fee → one read, no auto math.
        const econs = await readSubaccordEcons(
          ctx.accord.rpc,
          flags.subaccord as Address,
          ctx.commitment,
        );
        feeToken = econs.feeToken;
      } else {
        feeToken = flags["fee-token"] as Address;
      }
    } else {
      const econs = await readSubaccordEcons(
        ctx.accord.rpc,
        flags.subaccord as Address,
        ctx.commitment,
      );
      feeToken = econs.feeToken;
      const computed = requiredFee(econs.feePerJuror, econs.minJurySize);
      if (computed === null) {
        throw new Error(
          `FeeOverflow: ${econs.minJurySize} × ${econs.feePerJuror} exceeds u64 (Subaccord feePerJuror too large)`,
        );
      }
      fee = computed;
    }

    const filerTokenAccount = await findAssociatedTokenAddress(feeToken, filer);
    const [pauseState] = await findPauseStatePda();
    const feeVault = await findAssociatedTokenAddress(feeToken, flags.subaccord as Address);

    const { instruction, dispute, bump } = await ctx.accord.methods.createDispute(
      {
        filer,
        subaccord: flags.subaccord as Address,
        feeToken,
        filerTokenAccount,
        feeVault,
        pauseState,
      },
      { options, evidenceHash: evidence, nonce, fee },
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    await this.sendInstruction(ctx, instruction);
    this.emitCreated(dispute, { bump, fee });
  }
}

/**
 * Parse `--options "<hex>,<hex>,..."` into 2..32 × 32-byte arrays.
 * Each item may have an optional `0x` prefix.
 */
export function parseOptions(raw: string): Uint8Array[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 2 || parts.length > 32) {
    throw new Error(`InvalidOptions: expected 2..32 options, got ${parts.length}`);
  }
  return parts.map((p, i) => parseHash32(p, `option[${i}]`));
}

/** Parse a 32-byte hex string (optional `0x` prefix). */
export function parseHash32(raw: string, label: string): Uint8Array {
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`Invalid${label}: expected 32-byte hex (64 chars), got "${raw}"`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Resolve `--nonce`: omit/'random' → random u64 (LE); else parse as bigint. */
function resolveNonce(raw: string | undefined): bigint {
  if (raw === undefined || raw === "random") {
    const bytes = randomBytes(8);
    return new DataView(bytes.buffer).getBigUint64(0, true);
  }
  const cleaned = raw.replace(/_/g, "");
  if (!/^\d+$/.test(cleaned)) {
    throw new Error(`InvalidNonce: expected u64 (or 'random'), got "${raw}"`);
  }
  return BigInt(cleaned);
}
