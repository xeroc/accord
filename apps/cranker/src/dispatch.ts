/**
 * Crank dispatch — the single merge point between the reconciler and the
 * per-crank implementations (milestone accord-27r5 §2).
 *
 * The map starts empty; each crank registers its handler in its own epic
 * (`src/cranks/<name>.ts` calls {@link registerCrank} / {@link CrankDispatch.register}).
 * The reconciler never imports a crank directly — it looks the action kind up
 * here. That keeps every crank an independent addition: no shared file is
 * edited to ship one.
 *
 * Two registration flavours, both one-liners per crank:
 *   - {@link registerCrank} — adapts the nine SDK-direct executors
 *     (`execute: (ctx, action) => Promise<CrankResult>`) into a handler that
 *     also logs deliberate skips.
 *   - `dispatch.register(kind, handler)` — for cranks that manage their own
 *     control flow (draw_seat, which loops over seats and swallows
 *     SimulationError mid-loop).
 */
import type { Address } from "@solana/kit";

import type { ActionOf, CrankAction, CrankContext, CrankKind, CrankResult } from "./types.js";

// Re-exported so crank authors import everything from one place.
export type { ActionOf, CrankAction, CrankContext, CrankKind, CrankResult };

/** A registered crank: receives the context + the resolved action. */
export type CrankHandler = (ctx: CrankContext, action: CrankAction) => Promise<void>;

export interface CrankDispatch {
  /** Register a handler for an action kind. Throws on duplicate registration. */
  register(kind: CrankKind, handler: CrankHandler): void;
  /** Run the handler for `action.kind`. Returns true iff a handler ran. */
  execute(ctx: CrankContext, action: CrankAction): Promise<boolean>;
  /** Whether a handler is registered for `kind`. */
  has(kind: CrankKind): boolean;
}

export function createCrankDispatch(): CrankDispatch {
  const handlers = new Map<CrankKind, CrankHandler>();
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

/**
 * Register one of the nine SDK-direct executors. The executor returns a
 * {@link CrankResult} (`{signature}` on success, `{skipped}` on a deliberate
 * no-op); this wrapper funnels the skip reason into the per-crank log so a
 * silent skip still leaves a trail. Success-path logging stays in each
 * executor (it already calls `ctx.log` with the signature).
 */
export function registerCrank<K extends CrankKind>(
  dispatch: CrankDispatch,
  kind: K,
  execute: (ctx: CrankContext, action: ActionOf<K>) => Promise<CrankResult>,
): void {
  dispatch.register(kind, async (ctx, action) => {
    const result = await execute(ctx, action as ActionOf<K>);
    if (result.skipped !== undefined) {
      const dispute = "dispute" in action ? (action as { dispute: Address }).dispute : null;
      ctx.log(kind, dispute, `skipped: ${result.skipped}`);
    }
  });
}
