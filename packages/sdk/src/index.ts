/**
 * @veridao/sdk — TypeScript SDK for the VeriDAO Accord program on Solana.
 *
 * Public surface:
 *   - `Accord`         — facade class (primary entry point)
 *   - `wallet`         — signer adapter (Keypair | IWallet → Kit TransactionSigner)
 *   - `pda`            — canonical PDA derivations (all 8 accounts)
 *   - `constants`      — v1 protocol defaults and bounds
 *   - `errors`         — typed AccordError code map
 *   - `types`          — domain enums and structs (re-exported from generated)
 *   - `generated`      — raw Codama output (codecs, Ix builders, account fetchers)
 *
 * @see ADR-0010
 */

export { Accord, type AccordClient, type AccordConfig } from "./accord";
export {
  type AccordSigner,
  type IWallet,
  signerFromKeypairBytes,
  signerFromWallet,
} from "./wallet";
export {
  ACCORD_PROGRAM_ID,
  findAppealBondPda,
  findDisputePda,
  findJurorStakePda,
  findPauseStatePda,
  findPendingUpdatePda,
  findRoundPda,
  findSnapshotPda,
  findSubaccordPda,
} from "./pda";
export * from "./constants";
export {
  AccordErrors,
  ACCORD_ERROR_CODE_OFFSET,
  type AccordErrorCode,
  type AccordErrorName,
} from "./errors";
export * from "./types";

export const SDK_NAME = "@veridao/sdk";
export const SDK_VERSION = "0.1.0";
