/**
 * Crank dispatch — the single merge point between the reconciler and the
 * per-crank implementations (milestone accord-27r5 §2).
 *
 * The map starts empty; each crank registers its handler in its own epic
 * (`src/cranks/<name>.ts` calls {@link CrankDispatch.register}). The reconciler
 * never imports a crank directly — it looks the action kind up here. That keeps
 * every crank an independent addition: no shared file is edited to ship one.
 */
import type {
  Account,
  Address,
  Instruction,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import type { Dispute, Round } from "@useaccord/sdk";

import type { CrankAction } from "./state.js";
import type { CrankerWallet } from "./wallet.js";

/** Everything a crank handler needs to build + send its instruction. */
export interface CrankContext {
  /** Decoded Dispute account with its on-chain address. */
  readonly dispute: Account<Dispute>;
  /**
   * The Round the resolver used: the current round for lifecycle cranks, or a
   * prior round for `settle_round`. `null` when the Round PDA does not exist.
   */
  readonly round: Account<Round> | null;
  /** Funded fee-payer for every crank tx. */
  readonly wallet: CrankerWallet;
  readonly rpc: Rpc<SolanaRpcApi>;
  readonly rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** Build + sign + confirm one instruction (retry + priority-fee escalation). */
  readonly send: (instruction: Instruction) => Promise<string>;
}

/** A registered crank: receives the context + the resolved action. */
export type CrankHandler = (ctx: CrankContext, action: CrankAction) => Promise<void>;

export interface CrankDispatch {
  /** Register a handler for an action kind. Throws on duplicate registration. */
  register(kind: CrankAction["kind"], handler: CrankHandler): void;
  /** Run the handler for `action.kind`. Returns true iff a handler ran. */
  execute(ctx: CrankContext, action: CrankAction): Promise<boolean>;
  /** Whether a handler is registered for `kind`. */
  has(kind: CrankAction["kind"]): boolean;
}

export function createCrankDispatch(): CrankDispatch {
  const handlers = new Map<CrankAction["kind"], CrankHandler>();
  return {
    register(kind, handler) {
      if (handlers.has(kind)) {
        throw new Error(`crank handler already registered for "${kind}"`);
      }
      handlers.set(kind, handler);
    },
    async execute(ctx, action) {
      const handler = handlers.get(action.kind);
      if (handler === undefined) return false;
      await handler(ctx, action);
      return true;
    },
    has(kind) {
      return handlers.has(kind);
    },
  };
}

/** Re-exported for crank authors who need the Address/Account types in signatures. */
export type { Account, Address };
