/**
 * Canon facade — the primary consumer surface for the @useaccord/canon SDK.
 *
 * Composes the generated Codama Kit client with domain-level helpers. Mirrors
 * the Accord SDK facade pattern (ADR-0010): two layers — a Codama-generated
 * Kit client (drift-free instruction builders + account codecs) and a thin
 * hand-written facade that owns PDA derivation and typed instruction builders.
 *
 * @see ADR-0010
 */

import {
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from "@solana/kit";

import {
  canonProgram,
  type CanonPlugin,
  type CanonPluginRequirements,
} from "./generated/programs/canon.js";
import { CANON_PROGRAM_ID } from "./pda.js";

/** A Kit client extended with the Canon plugin. */
export type CanonClient = ReturnType<ReturnType<typeof canonProgram>>;

export interface CanonConfig {
  /** JSON-RPC endpoint (e.g. "http://127.0.0.1:8899"). */
  endpoint: string;
  /** A Kit TransactionSigner (from @solana/kit). */
  signer: TransactionSigner;
}

export class Canon {
  /** The canonical Canon program address. */
  static readonly PROGRAM_ID = CANON_PROGRAM_ID;

  readonly rpc: Rpc<SolanaRpcApi>;
  readonly signer: TransactionSigner;
  readonly client: CanonClient;

  constructor(config: CanonConfig) {
    this.rpc = createSolanaRpc(config.endpoint);
    this.signer = config.signer;
    this.client = canonProgram()(
      this.rpc as unknown as CanonPluginRequirements,
    );
  }
}

// Re-export the generated program address for convenience.
export { CANON_PROGRAM_ADDRESS } from "./generated/programs/canon.js";
export type {
  CanonPlugin,
  CanonPluginRequirements,
} from "./generated/programs/canon.js";
export type { Address };
