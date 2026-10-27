---
# accord-9q3e
title: Accord — configurable per-Subaccord round-1 jury size (default 3; enables N=1)
status: completed
type: task
priority: normal
tags:
    - accord
    - arena
created_at: 2026-08-11T21:07:46Z
updated_at: 2026-08-12T00:06:39Z
---

Why: ADR-0019 fixes the round-1 panel at the constant INITIAL_NUM_JURORS = 3 (constants.rs:91). The AI Bounty Court Arena (meta/PLAY.md §'AI Bounty Court') needs N=1 — a single attestation-gated AI juror (meta/specs/PROG-ATTESTTION.md) — so the MVP ships fast and upgrades to N=3 later as a PURE STAKING change (onboard 2 more attested operators), with zero Arena/Arbitrable refactor. Generalizing round-1 panel size also benefits any Arbitrable wanting a non-3 panel.

Change: add a per-Subaccord field (name TBD: 'min_jury_size' or 'round1_jurors'), u32, default 3, on CreateSubaccordParams + the Subaccord account. Thread through every site that reads the INITIAL_NUM_JURORS constant as the round-0 panel:

1. panel_size_for_round() round-0 branch (lib.rs ~2600) — return sub.min_jury_size instead of the constant.
2. create_dispute fee calc (lib.rs:835) — INITIAL_NUM_JURORS *fee_per_juror -> panel* fee_per_juror.
3. staker_count >= INITIAL_NUM_JURORS gate (lib.rs:841) -> >= min_jury_size.
4. UpdatePayload::FeePerJuror validation (lib.rs:2454) — uses INITIAL_NUM_JURORS; use the panel.
5. Appeal-ladder closed form (J+1)·2^k − 1 (lib.rs ~1725/2600): re-derive base J from min_jury_size. Stays odd for odd J; verify (J+1)·2^(max_appeals) − 1 <= MAX_JURORS (31) still holds for the chosen J.

Constraints / validation at create_subaccord:

- min_jury_size >= 1 and ODD (tie avoidance, constants.rs:5 comment).
- appeal-ladder ceiling check against MAX_JURORS for the chosen (min_jury_size, max_appeals) pair.
- For the Arena: min_jury_size=1, max_appeals=0 -> the ladder is NEVER exercised, so the change is contained to round-0.

ADR: amends/supersedes ADR-0019 ('round-1 fixed at 3') — record the generalization + the odd/ceiling invariants.

Change coupling (AGENTS.md §Change Coupling): make codegen -> SDK CreateSubaccordArgs -> CLI create-subaccord --min-jury-size flag -> SPEC.md Subaccord table + create_subaccord row -> .agents/skills/useaccord skill command examples. Whole workspace must stay green.

TDD (LiteSVM): N=1 happy path + fee calc; N=5 (odd) draw; even size rejected; appeal-ladder-fits-MAX_JURORS for small J; N=1 + max_appeals=0 never climbs the ladder.

## Summary of Changes (2026-08-12)

**Program (programs/accord):** `min_jury_size: u32` on Subaccord (immutable), CaseTerms (frozen at filing), CreateSubaccordParams. `panel_size_for_round(round_idx, base)` parameterized; threaded through draw_seat/finalize_dispute/appeal/claim_appeal_refund. create_subaccord validates odd + ladder-fits-MAX_JURORS (EvenJurySize, LadderExceedsMaxJurors errors). create_dispute fee = min_jury_size * fee_per_juror. canon CPI updated.

**Tests (TDD):** 6 new LiteSVM tests (N=1, even-reject, ladder-overflow-reject, ladder-fits, default). 5 existing CreateSubaccordParams literals updated. SDK tests: N=1 assertions for panelSizeForRound + requiredFee.

**SDK:** panelSizeForRound/maxAppealPanelSize take baseJurySize; CreateSubaccordArgs.minJurySize + assertValidMinJurySize; requiredFee(feePerJuror, minJurySize); adapter maps minJurySize; codegen regenerated.

**Consumers:** CLI --min-jury-size (create-subaccord, required-fee, dispute:create reads on-chain). e2e fixtures, draw-harness, cranker tests, frontend app updated.

**Docs:** SPEC.md (Subaccord table, create_subaccord/create_dispute rows, economics), ADR-0019 amendment (supersedes decision #2), useaccord skill flag tables + examples.

**Verification:** Rust LiteSVM all GREEN; SDK 89 tests GREEN; e2e 16/17 suites GREEN (61/64); reclaim.spec.ts pre-existing Surfpool issue (unrelated). Build + lint clean.
