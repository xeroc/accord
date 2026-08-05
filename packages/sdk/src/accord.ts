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
import { createAccordAdapter, type AccordAdapter } from "./adapter.js";
import { createAccordMethods, type AccordMethods } from "./methods.js";

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

  private _adapter?: AccordAdapter;

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

  /**
   * The concrete seam adapter — implements all seven `Accord*Client` seams
   * against the generated Codama client. Pass to the pure orchestration
   * functions in `src/methods/*.ts`, or use {@link methods} for bound helpers.
   */
  get adapter(): AccordAdapter {
    if (!this._adapter) this._adapter = createAccordAdapter(this);
    return this._adapter;
  }

  /**
   * Bound orchestration namespace covering all eight method groups. Each helper
   * validates (pure) + builds the instruction via {@link adapter}; the caller
   * signs + sends the returned `Instruction` with `this.signer`.
   */
  get methods(): AccordMethods {
    return createAccordMethods(this.adapter, ACCORD_PROGRAM_ID, this.signer);
  }
}
