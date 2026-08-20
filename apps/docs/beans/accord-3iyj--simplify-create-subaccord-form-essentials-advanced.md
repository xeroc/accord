---
# accord-3iyj
title: Simplify create-subaccord form — essentials + advanced collapsible
status: completed
type: feature
priority: normal
created_at: 2026-08-18T16:58:58Z
updated_at: 2026-08-18T16:59:18Z
---

Split SubaccordCreatePage into essentials (staking/fee token, min stake, fee per juror, aggregation with Median-only coherence tolerance, authority pre-filled with the wallet) and an advanced collapsible (identity with reshuffleable random domain ref, windows, panel, depth 12 default, immutable). Evidence operator becomes the VITE_EVIDENCE_OPERATOR env constant; form logic extracted to node-testable createForm.ts.

## Summary of Changes

Two-tier create-subaccord form at `/subaccords/new` (per simplify-accord-ux spec):

- **Essentials (always visible):** staking token, fee token, min stake, fee per
  juror, aggregation (+ coherence tolerance only when `aggregation = Median`),
  authority **pre-filled with the connected wallet pubkey** (editable; hidden
  when Immutable is checked in advanced).
- **Advanced (Radix Collapsible, closed by default):** Identity (domain ref —
  randomized on load, Reshuffle button; evidence spec), Windows (+ alpha bps),
  Panel (max appeals, reveal threshold, max draw attempts, pool capacity —
  default **depth 12 = 4,096 seats**), Immutable toggle.
- **Evidence operator is no longer a form field** — deployment constant
  `VITE_EVIDENCE_OPERATOR` (ADR-0006/0011), unset/empty → zero key. Added to
  `apps/app/.env.example` + `vite-env.d.ts`.
- `createForm.ts` (new): pure form logic extracted from the page — FormState,
  `defaultFormState(signer)` (authority prefill, random `randomHex32()`
  domain ref, depth 12), `buildArgs`, parsers, `EVIDENCE_OPERATOR`. Node-testable.
- Page split: `SubaccordCreatePage` gates on wallet; `CreateForm` keyed by
  `signer.address` (connect/switch → fresh defaults).
- Fixed latent test-glob bug: `apps/app` `pnpm test` glob expanded
  one-level-deep by the shell, silently skipping `src/features/**/*.test.ts`
  (e.g. evidence tests); quoted so node's recursive glob applies.

### Verification

- `apps/app`: lint (tsc) green; `pnpm test` 37/37 (9 new createForm tests);
  `vite build` green.
- Live-browser QA (vite dev + stub signer render via vite module graph):
  essentials render with authority value = signer; advanced unmounted when
  closed; Reshuffle produces a fresh 64-hex ref; Median ⇄ Plurality toggles
  coherence tolerance; collapsible transition (grid-template-rows 0.3s expo)
  and chevron rotate applied.
