---
# accord-oeem
title: Synod state + constants + errors skeleton, layout pin tests
status: completed
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T08:35:00Z
parent: accord-l2ad
blocked_by:
    - accord-8ymx
---

assigned: implementer
Mirror canon crate layout: constants.rs (SEED_CASE etc., MAX_PARTIES=7, bounds), state.rs (SynodCase + CaseState per SPEC §Account model — parties[7], joined/paid_out bitmasks, frozen fee, evidence[7], dispute sentinel), error.rs (AccordError-style enum: party-count, not-named-party, already-joined, not-opening, roster-incomplete, pot-not-positive, aggregation, deadline). Host layout-pin tests like accord tests.rs (offsets_match_borsh discipline). SPEC §2 is the field list authority. TDD: layout tests first.

## Summary of Changes

TDD: RED (`tests.rs` referencing missing `SynodCase`/`CaseState` — compile failure) → GREEN.

- `state.rs`: `SynodCase` (field order exactly SPEC §Account model: subaccord, parties[7], party_count, joined, stake, fee, join_deadline, evidence[7], dispute sentinel, paid_out, state, bump) + `CaseState {Opening, Live, Closed}` — no `Refunding` variant (roster-miss refunds settle per-party inside `refund_roster_miss` → `Closed`; doc'd on the enum).
- `constants.rs`: `SEED_CASE = b"case"`, `MAX_PARTIES = 7`, `MIN_PARTIES = 2` + `pub(crate) mod layout` mirroring accord's discipline (width consts → offset consts → `const _: () = assert!(last field <= 8 + INIT_SPACE)`).
- `error.rs`: `SynodError` (11 variants) — the bean's named set (party-count, not-named-party, already-joined, not-opening, roster-incomplete, pot-not-positive, aggregation, deadline×2 directions) + the SPEC §Open-time companions (DuplicateParty, OpenerNotFirstParty). IDL now carries 6000-6010.
- `src/tests.rs` (`#[cfg(test)] mod tests` in lib.rs, accord shape): `offsets_match_borsh` — distinctive-value fixture, slices party_count/joined/stake/fee/join_deadline/paid_out/state/dispute + pins total wire size `8 + INIT_SPACE`.
- lib.rs: crate doc header (canon style), `pub use error::SynodError`, dropped the unused `pub use instructions::*` re-export (empty stub; returns with the first instruction — keeps `cargo clippy -p synod` clean like canon).
- SPEC.md overview: placeholder-keypair note → canonical ID status line (reality after d6ce597).

### Verification

- `cargo test -p synod`: 2 passed (incl. `tests::layout_tests::offsets_match_borsh`).
- `cargo clippy -p synod --all-targets`: 0 warnings (only the workspace-wide non-root-profile note, identical for canon/accord).
- `cargo fmt -p synod --check`: clean.
- `anchor build --ignore-keys`: green; `target/idl/synod.json` carries the canonical address + all 11 error variants.
