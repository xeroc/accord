/**
 * Notify channel interface (bean accord-4qyb, epic accord-3tlt).
 *
 * Jurat reports through a channel so future sinks (Discord, email, …) drop in
 * without touching the duty pipeline. Contract: BOTH methods resolve even when
 * the sink is down — a notification failure must never crash or stall the
 * vote pipeline (milestone decision 8: alert, don't die).
 */

/** A settled agent verdict, reported for every duty — DRY_RUN or not. */
export interface VerdictNotice {
  /** Dispute account address (base58). */
  readonly dispute: string;
  /** Option index the verdict picked (Plurality pools only in v1). */
  readonly option: number;
  /** Agent's reasoning, forwarded verbatim (length-capped by the sink). */
  readonly rationale: string;
  /** Agent confidence, 0..1. */
  readonly confidence: number;
  /** Whether the daemon actually cast the vote (JURAT_DRY_RUN gate). */
  readonly dryRun: boolean;
}

export interface NotifyChannel {
  /** Report a settled verdict. Never rejects. */
  verdict(notice: VerdictNotice): Promise<void>;
  /** Report an operational alert (abstention, send failure, join skip, …). Never rejects. */
  alert(message: string): Promise<void>;
}
