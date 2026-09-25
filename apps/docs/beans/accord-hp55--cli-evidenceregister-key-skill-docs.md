---
# accord-hp55
title: 'CLI: evidence:register-key + skill docs'
status: completed
type: task
priority: normal
created_at: 2026-09-25T08:59:29Z
updated_at: 2026-09-25T09:00:45Z
parent: accord-5q2n
blocked_by:
    - accord-f7dp
---

---

assigned: implementer
---

`useaccord evidence:register-key --endpoint <url> [--key-out <path>]` for headless jurors: generate or load a delivery keypair, register it. Update `.agents/skills/useaccord` references (SKILL.md routing + relevant reference file) in the same change.

Summary of Changes
------------------

- **`apps/cli/src/commands/evidence/register-key.ts` (new)** — `useaccord evidence:register-key`: BaseCommand (HTTP-only, no chain), flags `--endpoint` (env `ACCORD_DAEMON_URL`), `--key-out` (default `~/.config/accord/delivery-key.json`, JSON `uint8[64]` = `pub‖secret` via SDK `encode`/`decodeDeliveryKeypair`, generated + persisted on first use, loaded thereafter), `--keypair` (standard wallet resolution). The wallet's `signMessages` provides the `signMessage` seam (no raw seed handling in the command — `wallet.ts` gained `readKeypairBytes`, extracted from `loadKeypair`); registers via SDK `registerDeliveryKey` and emits `{juror, enc_pub (base58), registered_at, key_file}` (`--json`/`--quiet` per the CLI output contract).
- **`apps/cli/test/commands/evidence/evidence.test.ts` (new)** — 4 tests against a verifying stub daemon (real `verifyDeliveryKeyRegistration` gate + monotonic 409): `--help`; happy register (key file created, sig-valid PUT observed, juror == wallet pub); re-run loads the SAME key (no regeneration, stable `enc_pub`); daemon 409 (future stored `registered_at`) exits non-zero with the status surfaced.
- **`.agents/skills/useaccord`** — new `references/12-evidence.md` (command examples, full flag table incl. env fallbacks, ADR-0034 semantics: registration message format, 400/409 gates, strict-404 delivery, self-heal flow, SDK fn table) + `SKILL.md` routing row and `when_to_use` mention.
- **Verification:** CLI `tsc` ✓, `eslint` ✓, `bun test` 144/144 (incl. the 4 new); workspace `pnpm -r build` + `lint` green. No daemon/SDK changes — consumes the f7dp surface as-is.
