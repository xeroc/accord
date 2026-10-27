---
# accord-4qyb
title: Telegram notifier
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T07:32:42Z
parent: accord-3tlt
---

src/notify/telegram.ts + channel interface: verdict message (dispute, option, rationale, confidence, dry-run flag), alerts. AC: unit tests with stubbed Bot API incl. send-failure never crashes duty pipeline.

## Summary of Changes

- `apps/jurat` package scaffolded (bun + tsc + eslint, mirroring evidence-daemon) — Epic 1's lane hadn't landed yet; minimal surface only.
- `src/notify/channel.ts` — `NotifyChannel` interface (`verdict(VerdictNotice)`, `alert(message)`) + `VerdictNotice` (dispute, option, rationale, confidence 0..1, dryRun). Contract: both methods never reject.
- `src/notify/telegram.ts` — `createTelegramChannel({ botToken, chatId, fetch?, onError?, sendTimeoutMs? })` against the Bot API `sendMessage` endpoint. Plain-text verdict message with dry-run flag line (DRY RUN/LIVE), confidence as percent, rationale capped at 3500 chars (Telegram 4096 limit). Send failures (throw, non-ok HTTP, hang > timeout) are swallowed after `onError` — a `Promise.race` timer guards against fetch impls that ignore abort signals. `FetchLike` type keeps the fetch injection test-friendly.
- `src/notify/telegram.test.ts` — 8 bun tests: message shape, live-vote flag, rationale cap, POST body/URL/chat_id, alert path, fetch-throw never-rejects, non-ok HTTP never-rejects, hang-times-out.
- `@useaccord/jurat` added to the changesets fixed (lockstep) group + changeset entry.

Verification: `pnpm run build` (tsc), `pnpm run lint` (eslint clean), `pnpm test` (8/8 pass) in `apps/jurat`.
