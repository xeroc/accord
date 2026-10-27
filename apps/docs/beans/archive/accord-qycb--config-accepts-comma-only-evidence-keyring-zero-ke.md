---
# accord-qycb
title: Config accepts comma-only EVIDENCE_KEYRING (zero-key daemon)
status: completed
type: bug
priority: high
created_at: 2026-08-06T20:29:10Z
updated_at: 2026-08-06T22:55:57Z
parent: accord-djso
---

---

assigned: implementer

---

## Bug (REVIEW item 14)

`loadConfig` (`src/config.ts:39`) validates `EVIDENCE_KEYRING` with:

```ts
if (keyring.trim().length === 0) { throw ... }
```

For input `",,"`: `.trim()` → `",,"` (trim strips whitespace, not commas) → length 3 → **passes**. `EnvKeyring.fromEnv` then splits on comma, filters empty entries → `size === 0`. The daemon starts with zero operator keys, passes config validation, and silently 404s every request.

## Fix

Validate `EnvKeyring.size > 0` **after** parsing, not just string non-emptiness before. Two options (pick one, KISS):

1. In `loadConfig`: parse `EnvKeyring.fromEnv(keyring)` and throw if `size === 0`. (Pulls keyring into config — slight layering bleed.)
2. In `EnvKeyring.fromEnv`: throw if no valid entries remain after filtering. (Cleaner — the keyring owns its invariant.)

Prefer option 2 — the trait impl owns the "at least one key" invariant; `loadConfig` just forwards the string.

## Test (RED first)

```
Given EVIDENCE_KEYRING=",,"   When loadConfig  Then throws /KEYRING/
Given EVIDENCE_KEYRING=" , , " When fromEnv    Then throws /empty|at least one/
Given one valid seed          When fromEnv     Then size === 1
```

Add to `tests/keyring.test.ts`.

## References

- REVIEW.md item 14
- `apps/evidence-daemon/src/config.ts:35-41`
- `apps/evidence-daemon/src/keys/keyring.ts:46-62`

## Summary of Changes

The fix already lived in `EnvKeyring.fromEnv` (throws when no non-empty entries
remain after comma-split + filter), but was **inert** — `main.ts` never
constructed the keyring, so `loadConfig`'s weak `keyring.trim().length === 0`
check let `EVIDENCE_KEYRING=",,,"` through and the daemon booted into a
silently-404s-everything state.

Now active end-to-end: accord-tzmm calls `EnvKeyring.fromEnv(cfg.keyring)` at
boot, so a zero-key keyring throws at startup. Verified by cold-boot smoke —
`EVIDENCE_KEYRING=",,,"` → exit 1, process never listens.
