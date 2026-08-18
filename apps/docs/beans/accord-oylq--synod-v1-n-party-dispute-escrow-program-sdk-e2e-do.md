---
# accord-oylq
title: Synod v1 — N-party dispute escrow (program + SDK + e2e + docs)
status: todo
type: milestone
created_at: 2026-08-18T05:27:40Z
updated_at: 2026-08-18T05:27:40Z
---

Ship Synod per programs/synod/SPEC.md: the N-party dispute-escrow Arbitrable — program (TDD), @useaccord/synod SDK (Codama), Surfpool e2e, docs. CONSISTENCY IS LOAD-BEARING: mirror Anchor 1.0.2 patterns and the canon crate/package/e2e conventions everywhere (canon is the reference Arbitrable; accord is the Core). Design authority: SPEC.md + ADRs synod/0001-0002 + meta/specs/PROG-MULTI-PARTY.md (decision ledger).

Scope IN: accord-n3vw core dependency, program instructions, SDK facade, e2e green rule, docs-as-built, consistency review.
Scope OUT: CLI commands, evidence-daemon grouping (accord-ybuq — e2e uses raw hash commitments), backers/asymmetric economics (parked accord-s72c).

## HANDOFF

### 1. Happy Path

1. Opener calls open_case(subaccord, parties[2..=7], stake S, join_deadline, nonce) → SynodCase PDA ["case", opener, nonce]. Fee frozen NOW: initial_num_jurors * fee_per_juror.
2. Each named party calls join(case, evidence_hash) → transfers S (subaccord.fee_token) into the case vault ATA, records its own evidence hash. Signer must equal the named party.
3. Full roster joined → anyone calls file_dispute(case) → CPI accord create_dispute with options[N+1] (option i = party i, option N = neutral at highest index), evidence_hash[0] = H(case_pda ‖ h_0 ‖ … ‖ h_{N-1}), nonce 0, case PDA as filer signer, fee paid from vault. State → Live.
4. Accord runs draw/commit/reveal/appeals. Synod is uninvolved (passive appeals — anyone appeals directly at Accord).
5. Anyone calls claim(case, dispute): Final + ruling i < N → party i gets pot = N*S − fee; Final + ruling == N (neutral) → each party S − fee/N (floor, remainder to last claimant); Failed (after accord cancel_dispute returned the fee) → each party S in full. Idempotent via paid_out bits; case closes when all bits set.

### 2. Data Contract

- SynodCase seeds ["case", opener, nonce]; fields: subaccord, parties[7] (naming order, opener index 0), party_count u8, joined u8 bitmask, stake u64, fee u64, join_deadline i64, evidence 7 × [u8;32], dispute Pubkey (Pubkey::default() until filed), paid_out u8 bitmask, state {Opening,Live,Closed}, bump.
- Option labels: options[i] = H("synod-opt" ‖ case_pda ‖ i) — program-assigned, parties never construct options.
- Instructions: open_case / join / file_dispute / refund_roster_miss / claim. Account lists per SPEC §Instructions; the file_dispute CPI account set mirrors canon challenge_item (CreateDispute accounts + case-PDA signer seeds + case vault ATA as filer_token_account).
- SDK: packages/synod → @useaccord/synod. codama.json mirrors packages/canon (own client under src/generated, never hand-edited); facade exports pda helpers (synodCasePda), methods, fetchers — mirror the canon facade layout exactly.
- Payout destination: party ATA of fee_token, pull-only.

### 3. Edge Cases & Constraints

- NEVER push payouts — pull-only, idempotent (paid_out bits). Missing party ATA must never block another claim.
- file_dispute requires ALL joined (early lock allowed, no deadline wait); refund_roster_miss requires now ≥ join_deadline AND roster incomplete. Both check-and-set state so double-file and double-refund are impossible.
- open_case validates: 2..=7 distinct parties, opener == parties[0], subaccord.aggregation == Plurality (Median has no option mapping), N*S > fee, join_deadline > now.
- Fee is FROZEN at open — never re-read Subaccord params at file (governance cannot shift the deal mid-window).
- Ties need NO Synod handling: Accord redraws (accord-n3vw). claim reads only Final/Failed.
- Neutral = highest option index; a MAJORITY neutral vote resolves normally → refunds.
- party == juror overlap: accepted documented risk — do not add draw exclusion.
- Canonical keypair BEFORE first anchor build; --ignore-keys discipline (AGENTS.md Gotchas). Scaffold declare_id 5o5VDoAZ… is a placeholder.
- Consistency rules: crate layout mirrors canon (constants.rs SEED_*, error.rs, instructions/<name>.rs with handler + Accounts ctx, thin #[program]); LiteSVM tests gated #![cfg(feature = "no-entrypoint")]; jest specs live in tests/src/ with one file per instruction group reusing setup/env|tokens|fixtures; cranker/canon GC NOT in scope.

### 4. Business Logic (pseudo-code)

```
open:  require distinct(parties) && opener==parties[0] && 2..=7 && Plurality && N*S>fee && deadline>now
       fee = sub.terms.initial_num_jurors * sub.terms.fee_per_juror   // frozen
join:  i = index_of(signer, parties); require joined & !(1<<i) && state==Opening && now<deadline
       transfer(S, party -> vault); evidence[i] = h; joined |= 1<<i
file:  require state==Opening && joined == (1<<N)-1
       evidence_hash = H(case_pda || evidence[0..N]); options[i] = H("synod-opt"||case_pda||i)
       cpi create_dispute(options, evidence_hash, nonce=0) [case PDA signs, vault pays fee]
       dispute = dispute_pda; state = Live
refund: require state==Opening && now>=deadline && joined != (1<<N)-1
        for each joined i not yet paid: transfer(S, vault -> party_i); paid_out |= 1<<i; state=Closed when all joined paid
claim: d = load(dispute); match d.state
       Final => r = d.final_ruling
         r < N  -> pay(party[r], N*S - fee) if !(paid_out & winner_bit)
         r == N -> for each joined i unpaid: pay(party_i, S - fee/N)  // floor; last claimant takes remainder
       Failed => for each joined i unpaid: pay(party_i, S)
       close case when paid_out covers joined
```

### 5. Definition of Done

- [ ] make test green end-to-end (Rust + LiteSVM + jest incl. every synod e2e spec on Surfpool)
- [ ] make lint green; pnpm -r lint/build/test green for packages/synod
- [ ] make codegen committed; src/generated never hand-edited
- [ ] every instruction: LiteSVM unit test (happy/auth/reinit/state-gate/arithmetic) AND an e2e spec
- [ ] programs/synod/SPEC.md matches code as built; ADR statuses reviewed; README/CONTEXT drift fixed
- [ ] canon-parity review passed (patterns, naming, package shape, harness reuse)

### 6. Test Matrix (Given / When / Then)

- Given fresh subaccord, When open_case with 8 parties, Then EvenPartyCount-style error
- Given case, When non-named wallet joins, Then authority error
- Given full roster, When join after state Live, Then state-gate error
- Given full roster, When file_dispute, Then dispute PDA bound, vault = N*S - fee, state Live
- Given incomplete roster + deadline passed, When refund_roster_miss, Then each joined party refunded S; second call no-op
- Given Final ruling = party 2 of 3, When claim by party 2, Then pot = 3*S - fee transferred once; replay is no-op
- Given Final ruling = neutral, When all claims, Then each gets S - fee/N; sum(leaves) <= vault
- Given Failed + cancel_dispute, When claims, Then each party receives S in full
- Given Median subaccord, When open_case, Then aggregation error
- Given S with N*S <= fee, When open_case, Then pot-positive error
- Given 7-party case, When file_dispute, Then options len == 8 and evidence_hash matches derivation
- Given tie round at Accord (after n3vw), When claim before Final, Then state-gate error (claim only reads Final/Failed)

### 7. Open Questions

- Canonical keypair custody — same multisig drill as accord/canon (ops decision, must precede first build task).
- Vault ATA creation timing (at open_case vs first join) — follow canon lazy-ATA precedent.
- Evidence daemon grouping (accord-ybuq) deliberately out of scope; e2e uses raw hashes.
