---
# accord-qp7c
title: Per-round evidence hashes — evidence-on-appeal
status: todo
type: milestone
priority: critical
created_at: 2026-08-09T16:55:52Z
updated_at: 2026-08-09T16:55:52Z
---

## Why

The Mutual needs two-sided adjudication for claims. Round-1 evidence is one-sided (Insured's claim + structural context). Counter-evidence naturally arrives when someone appeals. Currently `Dispute.evidence_hash` is a single `[u8; 32]` frozen at filing — appeals cannot introduce new evidence. This is the v1 substitute for full two-party disputes.

## Decision (from grilling)

Extend `Dispute.evidence_hash` from a single `[u8; 32]` to a fixed-size array `[[u8; 32]; MAX_APPEALS + 1]` (4 slots for rounds 0–3). Each appeal round can optionally bring new evidence. Cost escalation (more jurors per round) naturally limits abuse. `[0u8; 32]` sentinel = "no new evidence this round" (reuse prior round's evidence).

## HANDOFF

### 1. Happy Path

1. Filer calls `create_dispute(options, evidence_hash, nonce, fee)` → stored at `dispute.evidence_hashes[0]`
2. Round 0 jurors receive evidence for `evidence_hashes[0]` via the evidence daemon
3. Someone appeals → calls `appeal(new_evidence_hash)` → stored at `dispute.evidence_hashes[1]`
4. Round 1 jurors receive evidence for `evidence_hashes[0]` AND `evidence_hashes[1]` (accumulated)
5. Further appeals → `evidence_hashes[2]`, `evidence_hashes[3]` (if max_appeals allows)
6. `[0u8; 32]` at any slot = no new evidence that round (jurors reuse prior rounds' evidence)

### 2. Data Contract

- `Dispute.evidence_hashes: [[u8; 32]; MAX_APPEALS + 1]` replaces `evidence_hash: [u8; 32]`
- `create_dispute` instruction arg: `evidence_hash: [u8; 32]` (unchanged name, stored at `[0]`)
- `appeal` instruction gains: `new_evidence_hash: [u8; 32]` (optional via sentinel `[0u8; 32]`)
- Evidence daemon: deliver ALL non-zero `evidence_hashes[0..=round]` to drawn jurors
- `MAX_APPEALS` = 3 → array size = 4 (128 bytes added to Dispute account)

### 3. Edge Cases & Constraints

- Account resize: Dispute grows by 96 bytes (3 × 32). Pre-deployment (greenfield) — no migration.
- `layout_tests::offsets_match_borsh` must still pass (slices JurorStake/AppealBond, not Dispute — verify).
- Backward compatibility: `get_ruling` unaffected (reads `final_ruling`, not evidence). Arbitrables that only read round-0 evidence are unaffected.
- Layout-coupled with any other bean that resizes Dispute (none currently in-flight).
- Evidence daemon must handle multi-hash delivery: a juror drawn in round N gets N+1 evidence packages (or one combined package referencing all non-zero hashes).

### 4. Business Logic

```rust
// create_dispute: evidence_hash → evidence_hashes[0]
d.evidence_hashes[0] = evidence_hash;
// remaining slots zero-initialized by Anchor

// appeal: new_evidence_hash → evidence_hashes[current_round + 1]
let slot = dispute.current_round + 1;
dispute.evidence_hashes[slot as usize] = new_evidence_hash;

// evidence daemon delivery (per drawn juror):
for hash in dispute.evidence_hashes.iter().take((round + 1) as usize) {
    if *hash != [0u8; 32] {
        deliver_evidence(juror, hash);
    }
}
```

### 5. Definition of Done

- [ ] `Dispute.evidence_hash` → `Dispute.evidence_hashes: [[u8; 32]; MAX_APPEALS + 1]`
- [ ] `create_dispute` writes `evidence_hashes[0]`
- [ ] `appeal` accepts `new_evidence_hash` param, writes to correct slot
- [ ] Evidence daemon delivers per-round evidence (all non-zero hashes up to current round)
- [ ] EVIDENCE-FORMAT.md updated for multi-manifest packages
- [ ] LiteSVM tests: round-0 hash stored, appeal writes new hash, sentinel skips, daemon delivery
- [ ] SDK regenerated, facade updated
- [ ] ADR-0023 written
- [ ] Integration docs updated

### 6. Test Matrix

- Given a new dispute, When created, Then `evidence_hashes[0]` = filed hash, `[1..=3]` = zero
- Given a round-resolved dispute, When appealed with new_evidence_hash, Then `evidence_hashes[round+1]` = new hash
- Given an appeal with `[0u8; 32]`, When round opens, Then jurors receive prior rounds' evidence only
- Given max_appeals = 1, When 2nd appeal attempted, Then rejected (existing max_appeals check)
- Given a juror drawn in round 2, When daemon delivers, Then receives evidence_hashes[0], [1], [2] (all non-zero)

### 7. Open Questions

- Evidence daemon: deliver as separate packages (one per hash) or concatenate into one delivery? Separate is simpler and matches the per-hash verification model.
- Should the evidence daemon SPEC need a new endpoint, or does the existing delivery handler just loop over hashes?
- Layout coordination: verify no in-flight bean resizes Dispute concurrently.
