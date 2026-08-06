---
# accord-lgoo
title: 'Appeal immediately cancelable + stranded funds/jurors (REVIEW #2)'
status: in-progress
type: bug
priority: critical
created_at: 2026-08-06T17:00:42Z
updated_at: 2026-08-06T17:00:42Z
---

appeal resets state to Created but leaves filed_at unchanged, so the pre-draw cancel timeout (already elapsed from round 0) fires immediately. Cancel strands appeal fees, bonds, and prior-round active_draws. Fix: (1) stamp filed_at=now on appeal, (2) release prior-round jurors in cancel, (3) allow claim_appeal_refund on Failed.
