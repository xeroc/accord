/**
 * Flip-publication rule (ADR-0037 read gate).
 *
 * Convention: a verdict vote for **option 1** is the flip/publication side —
 * a dispute whose jury flipped has its durable trace record published. The
 * record is public iff it contains a verdict frame that is (i) unsealed at
 * read time (shared `seal.ts` predicate — sealed flips stay private like any
 * sealed frame) and (ii) `event.kind === "verdict"` with
 * `event.optionIndex === 1`. Holds (option 0) never publish.
 */
import { sealVisible, type Sealable } from "./seal.js";

/** Anything shaped like a trace envelope — only `event` is load-bearing. */
export interface TraceVisibilityFrame {
  readonly event: Sealable;
}

/** Public iff some frame is an unsealed option-1 verdict (see file header). */
export function isPublicTrace(envelopes: readonly TraceVisibilityFrame[], now: number): boolean {
  return envelopes.some((env) => {
    const ev = env.event as Sealable & { readonly kind?: unknown; readonly optionIndex?: unknown };
    return ev.kind === "verdict" && ev.optionIndex === 1 && sealVisible(ev, now);
  });
}
