/**
 * Telegram Bot API channel (bean accord-4qyb). Stubbed-fetch unit tests:
 * message shape (dispute, option, rationale, confidence, dry-run flag),
 * alert path, and the never-crash contract — a failed send resolves and
 * surfaces via onError instead of rejecting into the duty pipeline.
 */
import { describe, expect, it } from "bun:test";
import type { VerdictNotice } from "./channel.js";
import {
  createTelegramChannel,
  formatVerdictMessage,
  RATIONALE_CAP,
  type FetchLike,
} from "./telegram.js";

interface Captured {
  url: string;
  init: RequestInit;
}

/** Stub Bot API: records the single call, replies with the given status. */
function stubFetch(status = 200): { calls: Captured[]; fetch: FetchLike } {
  const calls: Captured[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ ok: status >= 200 && status < 300 }), {
      status,
    });
  };
  return { calls, fetch };
}

/** Type-safe single-call accessor. */
function theCall(calls: Captured[]): Captured {
  if (calls.length !== 1)
    throw new Error(`expected exactly 1 call, got ${calls.length}`);
  return calls[0]!;
}

const NOTICE: VerdictNotice = {
  dispute: "D1sputePda1111111111111111111111111111111",
  option: 2,
  rationale: "Claimant evidence hash matches the submitted bundle.",
  confidence: 0.62,
  dryRun: true,
};

describe("formatVerdictMessage", () => {
  it("carries dispute, option, percent confidence, and dry-run flag", () => {
    const msg = formatVerdictMessage(NOTICE);
    expect(msg).toContain(NOTICE.dispute);
    expect(msg).toContain("option 2");
    expect(msg).toContain("confidence 62%");
    expect(msg).toContain("DRY RUN");
    expect(msg).toContain(NOTICE.rationale);
  });

  it("flags live votes when dryRun is false", () => {
    const msg = formatVerdictMessage({ ...NOTICE, dryRun: false });
    expect(msg).toContain("LIVE");
    expect(msg).not.toContain("DRY RUN");
  });

  it("caps oversized rationales", () => {
    const msg = formatVerdictMessage({
      ...NOTICE,
      rationale: "x".repeat(RATIONALE_CAP + 500),
    });
    expect(msg.length).toBeLessThanOrEqual(RATIONALE_CAP + 250);
    expect(msg.endsWith("…")).toBe(true);
  });
});

describe("createTelegramChannel", () => {
  it("POSTs verdict to sendMessage with chat id and message body", async () => {
    const { calls, fetch } = stubFetch();
    const ch = createTelegramChannel({ botToken: "TOK", chatId: "42", fetch });
    await ch.verdict(NOTICE);
    const call = theCall(calls);
    expect(call.url).toBe("https://api.telegram.org/botTOK/sendMessage");
    expect(call.init.method).toBe("POST");
    const body = JSON.parse(String(call.init.body));
    expect(body.chat_id).toBe("42");
    expect(body.text).toContain(NOTICE.dispute);
  });

  it("sends alerts as their own message", async () => {
    const { calls, fetch } = stubFetch();
    const ch = createTelegramChannel({ botToken: "TOK", chatId: "42", fetch });
    await ch.alert("draw seat missed");
    const body = JSON.parse(String(theCall(calls).init.body));
    expect(body.text).toContain("draw seat missed");
  });

  it("resolves (never rejects) when fetch throws — onError sees the error", async () => {
    const errors: unknown[] = [];
    const failing: FetchLike = async () => {
      throw new Error("network down");
    };
    const ch = createTelegramChannel({
      botToken: "TOK",
      chatId: "42",
      fetch: failing,
      onError: (e) => errors.push(e),
    });
    await expect(ch.verdict(NOTICE)).resolves.toBeUndefined();
    await expect(ch.alert("boom")).resolves.toBeUndefined();
    expect(errors.length).toBe(2);
  });

  it("resolves when the Bot API answers non-ok", async () => {
    const errors: unknown[] = [];
    const { fetch } = stubFetch(503);
    const ch = createTelegramChannel({
      botToken: "TOK",
      chatId: "42",
      fetch,
      onError: (e) => errors.push(e),
    });
    await expect(ch.verdict(NOTICE)).resolves.toBeUndefined();
    expect(errors.length).toBe(1);
  });

  it("times out a hanging send instead of stalling the pipeline", async () => {
    const errors: unknown[] = [];
    const { promise } = Promise.withResolvers<Response>(); // never settles
    const hanging: FetchLike = () => promise;
    const ch = createTelegramChannel({
      botToken: "TOK",
      chatId: "42",
      fetch: hanging,
      sendTimeoutMs: 20,
      onError: (e) => errors.push(e),
    });
    await expect(ch.verdict(NOTICE)).resolves.toBeUndefined();
    expect(errors.length).toBe(1);
    expect(String(errors[0])).toContain("timed out");
  });
});
