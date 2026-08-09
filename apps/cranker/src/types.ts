/**
 * Crank contract — the seam between the reconciler's state resolver
 * (bean accord-rnel) and the per-crank executors (this package, bean
 * accord-g5lm).
 *
 * The resolver reads dispute state and emits a {@link CrankAction} (or
 * `null`); {@link ../dispatch.ts} routes the action to its executor in
 * {@link ./cranks/}. Each executor fetches whatever accounts the SDK
 * instruction needs (round PDAs, token ATAs, panel stakes) and sends one
 * tx via {@link CrankContext.sendIx} (retry + priority-fee escalation live
 * there, owned by the wallet scaffold — bean accord-7d4c).
 *
 * Design (milestone accord-27r5):
 *   - One tx per crank; no bundling.
 *   - Discriminator-only payloads: the resolver names the crank + the bits
 *     it alone knows (which prior round to settle, which appeal to refund).
 *     Everything else the executor derives from on-chain state.
 *   - SDK-only instruction builders; no raw encoding.
 */
import type { Accord } from "@useaccord/sdk";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";

/** The nine non-draw permissionless cranks (draw_seat is bean accord-7sky). */
export type CrankKind =
  | "request_vrf"
  | "finalize_round"
  | "finalize_dispute"
  | "settle_round"
  | "cancel_dispute"
  | "redraw"
  | "execute_update"
  | "execute_unpause"
  | "claim_refund";

/**
 * Discriminated action payload. `settle_round.roundIdx` and
 * `claim_refund.roundIdx` are the only non-`kind` discriminators — the
 * resolver picks WHICH prior round / appeal; the rest the executor derives.
 */
export type CrankAction =
  | { kind: "request_vrf"; dispute: Address }
  | { kind: "finalize_round"; dispute: Address }
  | { kind: "finalize_dispute"; dispute: Address }
  | { kind: "settle_round"; dispute: Address; roundIdx: number }
  | { kind: "cancel_dispute"; dispute: Address }
  | { kind: "redraw"; dispute: Address }
  | { kind: "execute_update"; subaccord: Address }
  | { kind: "execute_unpause" }
  | { kind: "claim_refund"; dispute: Address; roundIdx: number };

/** Extract a single crank action variant by kind (for executor signatures). */
export type ActionOf<K extends CrankKind> = Extract<CrankAction, { kind: K }>;

/** Cranker environment. The wallet scaffold (accord-7d4c) builds this. */
export interface CrankContext {
  /** SDK facade — RPC, signer, and the adapter implementing all SDK seams. */
  accord: Accord;
  /** Canonical Accord program id. */
  programId: Address;
  /** Funded cranker keypair — signs every crank tx. */
  signer: TransactionSigner;
  /** Cranker address (signer.address convenience). */
  cranker: Address;
  /** VRF oracle accounts (request_vrf CPI extras). */
  oracleQueue: Address;
  programIdentity: Address;
  /**
   * Send one instruction as one tx, with retry + priority-fee escalation on
   * send failure. Returns the signature. Simulation failures throw and are
   * NOT retried (another cranker / the user may have advanced the state).
   */
  sendIx: (ix: Instruction) => Promise<string>;
  /** Structured log sink — `{dispute} {kind} {msg}`. */
  log: (kind: CrankKind, dispute: Address | null, msg: string) => void;
}

/** Outcome of one crank attempt. */
export interface CrankResult {
  /** Tx signature on success. */
  signature?: string;
  /** Reason the crank was a deliberate no-op (e.g. wrong state, nothing to do). */
  skipped?: string;
}
