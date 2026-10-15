/**
 * Telegram Bot API channel (bean accord-4qyb, epic accord-3tlt).
 *
 * Fires for every settled verdict and every operational alert,
 * DRY_RUN-independent (milestone decision 1). Send failures are swallowed
 * after being reported to `onError` — the duty pipeline must never crash or
 * stall on a flapping Telegram (channel contract in ./channel.ts).
 */
import type { NotifyChannel, VerdictNotice } from "./channel.js";

/** Telegram caps messages at 4096 UTF-8 chars; leave headroom for the header. */
export const RATIONALE_CAP = 3500;

/** Default send budget: a hung Bot API must not stall the duty pipeline. */
export const SEND_TIMEOUT_MS = 10_000;

/** Minimal fetch shape the channel needs — injectable without the whole DOM type. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface TelegramChannelConfig {
  botToken: string;
  chatId: string;
  /** Injectable fetch (tests). Defaults to the global. */
  fetch?: FetchLike;
  /** Failure sink. Defaults to console.error. */
  onError?: (error: unknown) => void;
  /** Send timeout in ms (tests shrink it). Defaults to {@link SEND_TIMEOUT_MS}. */
  sendTimeoutMs?: number;
}

function capRationale(rationale: string): string {
  return rationale.length > RATIONALE_CAP ? `${rationale.slice(0, RATIONALE_CAP)}…` : rationale;
}

/** Plain-text verdict message: dispute, option, confidence, dry-run flag, rationale. */
export function formatVerdictMessage(notice: VerdictNotice): string {
  const confidence = `${Math.round(notice.confidence * 100)}%`;
  const voteLine = notice.dryRun ? "DRY RUN — no vote cast" : "LIVE — vote cast";
  return [
    `JURAT verdict — dispute ${notice.dispute}`,
    `option ${notice.option} · confidence ${confidence}`,
    voteLine,
    `rationale: ${capRationale(notice.rationale)}`,
  ].join("\n");
}

export function createTelegramChannel(config: TelegramChannelConfig): NotifyChannel {
  const doFetch = config.fetch ?? fetch;
  const onError = config.onError ?? console.error;
  const sendTimeoutMs = config.sendTimeoutMs ?? SEND_TIMEOUT_MS;

  async function send(text: string): Promise<void> {
    // Race, not AbortSignal: an injected (or hung) fetch may ignore signals —
    // the timer is the only guard that always fires.
    const { promise: timeout, reject: rejectTimeout } = Promise.withResolvers<never>();
    const timer = setTimeout(
      () => rejectTimeout(new Error(`telegram send timed out after ${sendTimeoutMs}ms`)),
      sendTimeoutMs,
    );
    try {
      const res = await Promise.race([
        doFetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: config.chatId, text }),
        }),
        timeout,
      ]);
      if (!res.ok) {
        onError(new Error(`telegram sendMessage failed: HTTP ${res.status}`));
      }
    } catch (error) {
      onError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    verdict: (notice) => send(formatVerdictMessage(notice)),
    alert: (message) => send(`JURAT alert\n${message}`),
  };
}
