---
# accord-6zpj
title: 'Fix SR3 L-series: VRF callback state gate, MST depth/index pin, sortition retry cap'
status: completed
type: task
priority: normal
created_at: 2026-09-23T09:07:37Z
updated_at: 2026-09-23T09:32:31Z
---

Resolves 2026-09-23 review findings L-3/L-4/L-5 in programs/accord: (1) commit_vrf_callback must require state==Created; (2) verify_and_recompute/verify_membership_and_prefix pin path.len()==depth and index<2^depth; (3) MAX_SORTITION_RETRIES lowered to a CU-reachable value with truthful comment. TDD: failing tests first, then fix, then docs (SPEC, security-checklist).

## Summary of Changes

RED → GREEN per TDD:

- SR3-L-3: commit_vrf_callback now requires state == Created (was != Failed). Untestable in LiteSVM/Surfpool — the scoped VRF identity PDA cannot sign in either harness; pinned via SPEC row + in-code comment.
- SR3-L-4: verify_and_recompute / verify_membership_and_prefix take depth and reject path.len() != depth and index >= 2^depth up front. Pre-fix an aliased index (index + 2^depth) genuinely VERIFIED — host test aliased_index_beyond_tree_depth_is_rejected was RED then GREEN. All 6 call sites threaded (stake x2, request_withdraw, reconcile_stake, prune_juror, reclaim_slot, draw_seat).
- SR3-L-5: MAX_SORTITION_RETRIES 1024 -> 128 + truthful comment (1024 was CU-unreachable). LiteSVM test draw_seat_rejects_retries_above_cu_bounded_cap grinds a genuine 483-retry whale chain — was RED (draw succeeded, 106k CU) then GREEN (MaxRetriesExceeded). SDK MAX_SORTITION_RETRIES mirror; CLI/cranker/e2e migrated off the 1024 literal.

Docs: SPEC rows 5+6, security-checklist SR3 rows (H-1/M-2 Open, L-3/4/5 Fixed), section 5 fee-on-transfer caveat.

Verification: cargo unit+LiteSVM 23 suites 0 failed (fresh sBPFv3 ELF, verify-sbf OK); pnpm build+lint clean; anchor test Surfpool 26 suites / 116 tests green.

Open follow-ups: SR3-H-1 dead-zone skip + withdraw gate, SR3-M-2 delta booking.
