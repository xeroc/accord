/**
 * Seal-on-read + unseal flush (ADR-0037, bean accord-0yxb).
 *
 * A verdict frame carries `unsealAt = round.revealEnd`; until that wall-clock
 * instant the frame must be withheld on EVERY read path — WS live send, WS
 * replay, REST `GET /trace` — so lazy jurors cannot free-ride live reasoning
 * (Schelling/herding protection). No read path may bypass {@link sealVisible}.
 *
 * `UnsealScheduler` is the live-fanout complement: for each sealed frame
 * ingested it arms one timer at `unsealAt` and re-fans the frame out to the
 * subscribers of that dispute when it elapses. `track` is called once per
 * sealed frame at ingest; read paths only ever filter.
 */

/** Anything with an optional unseal deadline (unix ms). Absent = never sealed. */
export interface Sealable {
  readonly unsealAt?: number;
}

/**
 * Still sealed at `now`? The sole seal decision — narrowing form, so timer
 * math can use `unsealAt` without re-checking.
 */
export function isSealed<T extends Sealable>(ev: T, now: number): ev is T & { unsealAt: number } {
  return ev.unsealAt !== undefined && now < ev.unsealAt;
}

/** The single seal predicate every read path must apply (WS live, WS replay, REST). */
export function sealVisible(ev: Sealable, now: number): boolean {
  return !isSealed(ev, now);
}

/** Order-preserving read-path filter: drop frames still sealed at `now`. */
export function filterVisible<T extends Sealable>(frames: readonly T[], now: number): T[] {
  return frames.filter((f) => sealVisible(f, now));
}

/** Re-fanout callback: deliver one unsealed frame to a dispute's live subscribers. */
export type UnsealFanout<T> = (dispute: string, frame: T) => void;

export class UnsealScheduler<T extends Sealable> {
  private readonly armed = new Set<Timer>();

  constructor(private readonly fanout: UnsealFanout<T>) {}

  /**
   * Arm a timer for a sealed frame (no-op if already visible — read paths
   * deliver those immediately). Fires `fanout(dispute, frame)` at `unsealAt`.
   */
  track(dispute: string, frame: T): void {
    const now = Date.now();
    if (!isSealed(frame, now)) return;
    const { unsealAt } = frame;
    const timer = setTimeout(() => {
      this.armed.delete(timer);
      this.fanout(dispute, frame);
    }, unsealAt - now);
    this.armed.add(timer);
  }

  /** Number of armed frames (telemetry/teardown assertions). */
  pending(): number {
    return this.armed.size;
  }

  /** Cancel all armed timers (shutdown). */
  dispose(): void {
    for (const timer of this.armed) clearTimeout(timer);
    this.armed.clear();
  }
}
