---
# veridao-i4jm
title: 'Snapshot trust hardening: re-post after void + richer fraud proof'
status: draft
type: task
created_at: 2026-08-04T04:04:36Z
updated_at: 2026-08-04T04:04:36Z
---

Deferred gaps from veridao-rrxs (Dispute Intake & Snapshot Trust), surfaced for human review:

1. **Re-post after void**: a successfully-challenged (Voided) snapshot cannot be re-posted today (post_snapshot uses init = one-shot per round), so the dispute stalls and the filer fee is locked. Add a re-post path (e.g. close+reinit the Snapshot, or a Voided->re-postable transition) so a non-fraudulent poster can rescue the dispute after a fraudulent one is ousted.

2. **Richer fraud proof**: challenge_snapshot only verifies duplicate-Juror fraud today (the one class that is on-chain verifiable without comparing to live JurorStake state, which drifts as jurors stake/unstake during the 1-day window). Wrong-stake / missing-juror / extra-juror fraud needs an off-chain data anchor (e.g. a frozen-slot stake witness) to be provable on-chain. Wire in the hardening bean.

3. **staker_count eligibility**: the coarse intake gate counts any stake > 0, not >= min_stake (min_stake mutates via the 48h timelock and can't be recomputed without the O(n) ledger ADR-0003 rejected). Precise eligibility is verified at draw against the finalized snapshot; revisit if dispute data shows the coarse gate lets too many deadlocked disputes through.

Parent: veridao-rlno. Related: veridao-nhbj (Hardening & Formal Spec).
