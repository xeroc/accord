---
# accord-ipja
title: Full-lifecycle e2e + green-rule sign-off (make test)
status: todo
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-ndl9
blocked_by:
    - accord-8pd1
---

assigned: tester
synod.full-lifecycle spec: 2-party happy path AND 7-party max-roster AND neutral AND a Failed-path case (cancel_dispute → full refunds), driving open→join→file→claim through the SDK. Then the green rule: make test green (Rust + LiteSVM + jest incl. all synod specs + existing accord/canon suites still green). Requires accord-n3vw landed (ties redraw) — 7-party + neutral options exercise it. No skipped specs outside the offline CI lane.
