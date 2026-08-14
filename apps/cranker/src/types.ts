/**
 * Crank contract — the single canonical seam between the reconciler's state
 * resolver (bean accord-rnel) and every per-crank executor (bean accord-g5lm
 * for the nine non-draw cranks, bean accord-7sky for draw_seat).
 *
 * The resolver reads dispute state and emits a {@link CrankAction} (or `null`);
 * {@link ./dispatch.ts} routes the action to its executor in {@link ./cranks/}.
 * Each executor fetches whatever accounts the SDK instruction needs (round
 * PDAs, token ATAs, panel stakes) and sends one tx via {@link CrankContext.sendIx}
 * (retry + priority-fee escalation live there, owned by the wallet scaffold —
 * bean accord-7d4c).
 *
 * Design (milestone accord-27r5):
 *   - One tx per crank; no bundling.
 *   - Discriminator-only payloads: the resolver names the crank + the bits it
 *     alone knows (which prior round to settle, which appeal to refund, which
 *     seat to draw). Everything else the executor derives from on-chain state.
 *   - SDK-only instruction builders; no raw encoding.
 */
import type { Accord, Dispute, Round } from "@useaccord/sdk";
import type {
  Account,
  Address,
  Instruction,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  TransactionSigner,
} from "@solana/kit";
/**
 * Every crank kind, program-qualified by prefix: Accord cranks (the host
 * program — beans accord-g5lm / accord-7sky) are bare instruction names; Canon
 * cranks (the Arbitrable guest program, bean accord-7fj6) carry the `canon_`
 * prefix. Executors live in `./cranks/accord/` and `./cranks/canon/`
 * respectively, so the kind prefix, the filesystem, and every log line
 * (`crank <kind>`) all name the program.
 */
export type CrankKind =
  | "request_vrf"
  | "draw_seat"
  | "finalize_round"
  | "finalize_dispute"
  | "settle_round"
  | "cancel_dispute"
  | "redraw"
  | "execute_update"
  | "execute_unpause"
  | "claim_refund"
  | "reclaim_slot"
  | "canon_advance_pending"
  | "canon_settle_item"
  | "canon_advance_withdrawal";

/**
 * Discriminated action payload. `draw_seat.seat`, `settle_round.roundIdx`, and
 * `claim_refund.roundIdx` are the only non-`kind` discriminators — the resolver
 * picks WHICH seat / prior round / appeal; the rest the executor derives.
 *
 * The state resolver (state.ts) emits the lifecycle subset
 * (request_vrf/draw_seat/finalize_round/finalize_dispute/settle_round/
 * cancel_dispute/redraw); the reconciler stamps the dispute address before
 * dispatch. The slot-timelock + refund cranks (execute_update/execute_unpause/
 * claim_refund) are emitted by their own resolvers over different account
 * families (PendingUpdate / AccordState / AppealBond). The Canon cranks
 * (canon-state.ts) key off the item PDA — every other account (list, dispute,
 * vault, payee ATAs) is derived from on-chain state by the executor.
 */
export type CrankAction =
  | { kind: "request_vrf"; dispute: Address }
  | { kind: "draw_seat"; dispute: Address; seat: number }
  | { kind: "finalize_round"; dispute: Address }
  | { kind: "finalize_dispute"; dispute: Address }
  | { kind: "settle_round"; dispute: Address; roundIdx: number }
  | { kind: "cancel_dispute"; dispute: Address }
  | { kind: "redraw"; dispute: Address }
  | { kind: "execute_update"; subaccord: Address }
  | { kind: "execute_unpause" }
  | { kind: "claim_refund"; dispute: Address; roundIdx: number }
  | { kind: "reclaim_slot"; subaccord: Address; jurorStake: Address }
  | { kind: "canon_advance_pending"; item: Address }
  | { kind: "canon_settle_item"; item: Address }
  | { kind: "canon_advance_withdrawal"; item: Address };

/** Extract a single crank action variant by kind (for executor signatures). */
export type ActionOf<K extends CrankKind> = Extract<CrankAction, { kind: K }>;

/**
 * Cranker environment — the unified context every crank handler receives.
 * Combines the SDK facade + program identity (the nine SDK-direct cranks) with
 * the per-dispute snapshot + RPC handles (draw_seat + the reconciler's send
 * path). Built fresh per dispute by the reconciler.
 */
export interface CrankContext {
  /** SDK facade — RPC, signer, and the adapter implementing all SDK seams. */
  readonly accord: Accord;
  /** Canonical Accord program id (`Accord.PROGRAM_ID`). */
  readonly programId: Address;
  /** Cranker fee-payer address (convenience = wallet.address). */
  readonly cranker: Address;
  /** VRF oracle accounts (request_vrf CPI extras). */
  readonly oracleQueue: Address;
  readonly programIdentity: Address;
  /** The cranker's transaction signer (Canon SDK instruction callers). */
  readonly signer: TransactionSigner;
  /**
   * Send one instruction as one tx, with retry + priority-fee escalation on
   * send failure. Returns the signature. Simulation failures throw and are
   * NOT retried (another cranker / the user may have advanced the state).
   */
  readonly sendIx: (ix: Instruction) => Promise<string>;
  /** Structured per-crank log sink — `{kind} {subject} {msg}`. `subject` is
   * the account the crank acts on: the Dispute PDA for Accord lifecycle
   * cranks, the CanonItem PDA for Canon cranks. */
  readonly log: (kind: CrankKind, subject: Address | null, msg: string) => void;
  /**
   * The dispute this cycle resolved against (dispute-lifecycle cranks only).
   * Undefined for program-wide cranks (`execute_update`, `execute_unpause`)
   * and every Canon crank (which key off the item instead).
   */
  readonly dispute?: Account<Dispute>;
  /**
   * The Round the resolver used: the current round for lifecycle cranks, or a
   * prior round for `settle_round`. `null` when the Round PDA does not exist.
   */
  readonly round?: Account<Round> | null;
  /** Live RPC + subscriptions (TreeCache, send). */
  readonly rpc: Rpc<SolanaRpcApi>;
  readonly rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

/** Outcome of one crank attempt. */
export interface CrankResult {
  /** Tx signature on success. */
  signature?: string;
  /** Reason the crank was a deliberate no-op (e.g. wrong state, nothing to do). */
  skipped?: string;
}
