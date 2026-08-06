---
# accord-qycb
title: Config accepts comma-only EVIDENCE_KEYRING (zero-key daemon)
status: todo
type: bug
priority: high
created_at: 2026-08-06T20:29:10Z
updated_at: 2026-08-06T20:29:10Z
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
