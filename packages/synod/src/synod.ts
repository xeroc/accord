/**
 * Synod facade — the primary consumer surface for the @useaccord/synod SDK.
 *
 * Composes the generated Codama Kit client with domain-level helpers. Mirrors
 * the Accord/Canon SDK facade pattern (ADR-0010): two layers — a
 * Codama-generated Kit client (drift-free instruction builders + account
 * codecs) and a thin hand-written facade that owns PDA derivation and typed
 * instruction builders.
 *
 * @see ADR-0010
 */

import {
  createSolanaRpc,
  type ExtendedClient,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from "@solana/kit";

import {
  synodProgram,
  type SynodPlugin,
  type SynodPluginRequirements,
} from "./generated/programs/synod.js";
import { SYNOD_PROGRAM_ID } from "./pda.js";

/** A Kit client extended with the Synod plugin (`client.synod.…`). */
export type SynodClient = ExtendedClient<
  SynodPluginRequirements,
  { synod: SynodPlugin }
>;

export interface SynodConfig {
  /** JSON-RPC endpoint (e.g. "http://127.0.0.1:8899"). */
  endpoint: string;
  /** A Kit TransactionSigner (from @solana/kit). */
  signer: TransactionSigner;
}

export class Synod {
  /** The canonical Synod program address. */
  static readonly PROGRAM_ID = SYNOD_PROGRAM_ID;

  readonly rpc: Rpc<SolanaRpcApi>;
  readonly signer: TransactionSigner;
  readonly client: SynodClient;

  constructor(config: SynodConfig) {
    this.rpc = createSolanaRpc(config.endpoint);
    this.signer = config.signer;
    this.client = synodProgram()(
      this.rpc as unknown as SynodPluginRequirements,
    );
  }
}

// Re-export the generated program address for convenience.
export { SYNOD_PROGRAM_ADDRESS } from "./generated/programs/synod.js";
export type {
  SynodPlugin,
  SynodPluginRequirements,
} from "./generated/programs/synod.js";
