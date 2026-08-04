/**
 * Accord facade — the primary consumer surface for the VeriDAO Accord SDK.
 *
 * Composes the generated Codama Kit client with domain-level orchestration.
 * Method-group modules (`src/methods/*.ts`) are standalone functions that take
 * the facade's client + args; this class pre-wires delegation to each group.
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
  accordProgram,
  type AccordPlugin,
  type AccordPluginRequirements,
} from "./generated/programs/accord";
import { ACCORD_PROGRAM_ID } from "./pda";

/** A Kit client extended with the Accord plugin. */
export type AccordClient = ReturnType<ReturnType<typeof accordProgram>>;

export interface AccordConfig {
  /** JSON-RPC endpoint (e.g. "http://localhost:8899"). */
  endpoint: string;
  /** A Kit TransactionSigner (from wallet.ts or @solana/kit). */
  signer: TransactionSigner;
}

export class Accord {
  /** The canonical Accord program address. */
  static readonly PROGRAM_ID = ACCORD_PROGRAM_ID;

  readonly rpc: Rpc<SolanaRpcApi>;
  readonly signer: TransactionSigner;
  readonly client: AccordClient;

  constructor(config: AccordConfig) {
    this.rpc = createSolanaRpc(config.endpoint);
    this.signer = config.signer;
    // Extend the RPC with the Accord plugin (accounts, instructions, PDAs).
    // The RPC satisfies AccordPluginRequirements at runtime; the type assertion
    // bridges Kit's generic client interface for the shell.
    this.client = accordProgram()(
      this.rpc as unknown as AccordPluginRequirements,
    );
  }
}
