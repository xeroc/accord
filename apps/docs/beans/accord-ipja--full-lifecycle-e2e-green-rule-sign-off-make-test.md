---
# accord-ipja
title: Full-lifecycle e2e + green-rule sign-off (make test)
status: completed
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-ndl9
blocked_by:
    - accord-8pd1
---

assigned: tester
synod.full-lifecycle spec: 2-party happy path AND 7-party max-roster AND neutral AND a Failed-path case (cancel_dispute → full refunds), driving open→join→file→claim through the SDK. Then the green rule: make test green (Rust + LiteSVM + jest incl. all synod specs + existing accord/canon suites still green). Requires accord-n3vw landed (ties redraw) — 7-party + neutral options exercise it. No skipped specs outside the offline CI lane.

## Summary of Changes

- `tests/src/synod.full-lifecycle.spec.ts` (3 tests, all green) — the complete arc with **real Accord dispute resolution** (no fabricated states): `open → join ×N → file_dispute (CPI) → injectCommittedVrf → resolveDistinctPanel → draw_seat → commit ×3 → reveal ×3 → finalize_round → finalize_dispute → claim`, reusing draw-harness panel plumbing + synod-harness case composers.
  - *2-party happy path*: unanimous party-1 vote → prevailing party pulls the whole pot `2·S − fee`; vault drains to 0; case Closed on the one-shot payout.
  - *7-party max roster + neutral*: every juror votes option index 7 (the 8-option space from n3vw); first six claims take `⌊pot/7⌋`, the last claimant drains the remainder; vault exactly 0; `paidOut == 0b1111111`; Closed.
  - *Failed path*: REAL pre-draw `cancel_dispute` (3-day warp) returns the frozen fee into the case vault (filer_token_account = the vault — asserted at `2·S`), then every party pulls `S` in full; Closed.
- `synod-harness.ts`: `SynodArm` now carries the armed jury pool (`jurors`/`tree`/`jurorPdaByHex`) so specs can run real draw/vote chains; draw-harness exports `TreeTracker`.

**Green rule satisfied**: `make test` = **25/25 suites, 99/99 tests, 0 skipped** (Rust + LiteSVM + jest incl. every synod spec, the un-skipped canon.challenge CPI spec, and all accord suites). `pnpm -r` lint/build/test green across packages+apps.

Lane environment: `surfpool start --yes --db :memory: --no-tui --offline` on the default ports (self-referential datasource; mainnet-fork datasources fail lazy account fetches without egress).
