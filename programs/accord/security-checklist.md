# Accord — Security Checklist

> Applied per the **safe-solana-builder** `shared-base.md` rule set (sections 1–31).
> Risk level: **🔴 Critical** — vaults holding staked USDC, multi-CPI (VRF,
> Arbitrable), admin keys (Subaccord authority, pause authority, upgrade
> authority), large TVL potential.
>
> Source of truth audited: `src/lib.rs`, `src/state.rs`, `src/errors.rs`,
> `src/constants.rs`, `src/events.rs`. Findings cite `file:line`.
> Status legend: ✅ satisfied · ⚠️ partial / known gap · 🟥 finding.

---

## High-Risk Decisions (admin keys, upgrade authority, irreversible transitions)

> Critical-risk programs must flag every admin key, upgrade authority, and
> irreversible state transition. These are the items a production deploy must
> accept, mitigate, or fix before mainnet.

### 🟥 H-1. `draw` trusts a caller-supplied "VRF result" — the VRF result is NOT verified on-chain

`lib.rs:696-744` — `vrf_result: [u8; 32]` is an **instruction argument**, not a
verified VRF account. The `Draw` accounts struct (`lib.rs:1815-1842`)
contains no VRF account and no freshness/commit-then-result check.
The only on-chain use is `hashv(&[&vrf_result, …])` for an audit seed
(`lib.rs:755-763`). **Consequence:** a permissionless cranker can pass any 32
bytes and thereby choose the sortition seed → effectively choose the drawn
Jurors (combined with off-chain proof construction). This voids the
stake-weighted-uniform randomness assumption that is the draw's whole security
model (ADR-0003). The doc comment at `lib.rs:683-695` claims "consumes
VRF" but the implementation does not. **Must wire real VRF verification
(or a VRF randomness account) before any dispute with real value at
stake.** This is the single highest-severity gap.

### 🟥 H-2. `PauseState.authority` is immutable — no rotation path after `initialize_pause`

`lib.rs:74-80` sets `pause_state.authority` once; no instruction ever writes it
again. `UpdatePayload` (`state.rs:232-244`) has no `PauseAuthority` variant.
**Consequence:** key loss or compromise of the pause authority is permanent —
either the program can never be paused again, or a compromised key can pause
indefinitely (the timelocked `execute_unpause` recovers from a _freeze_, but not
from authority loss). ADR-0007's Squads-multisig mitigation reduces likelihood
but the on-chain contract offers no recovery. **Recommend:** add a two-step
rotation (`propose_pause_authority` / `accept_pause_authority`) mirroring §24.2,
or document the multisig-only recovery path explicitly in ADR-0007.

### ⚠️ H-3. `Subaccord.authority` rotation is one-step (timelock-only, no accept)

`lib.rs:383` — `UpdatePayload::Authority(v) => sub.authority = *v` applies the
new authority directly on `execute_subaccord_update`. There is no
`pending_authority` / accept step (§24.2). Mitigation: the 48h on-chain timelock
(`UPDATE_TIMELOCK_SLOTS`) gives stakers a window to unstake before a change
lands (`state.rs:173-174` doc), so the blast radius of a misrouted key is
bounded to the Subaccord, not the program. Acceptable for v1 if documented; a
two-step pattern is the defense-in-depth upgrade.

### ⚠️ H-4. Program upgrade authority is off-chain policy only (ADR-0007)

BPF upgrade authority cannot be constrained on-chain. ADR-0007 mandates Squads
multisig → post-audit freeze (`None`). This is an operational invariant, not a
code property — flag for the deploy/runbook, not the auditor. Any upgrade before
the post-audit freeze can replace the entire program logic.

### 🟥 H-5. Voided snapshot permanently stalls the dispute — filer fee trapped

`lib.rs:607` sets `SnapshotStatus::Voided`; `finalize_snapshot` requires `Posted`
(`lib.rs:639-642`), and `post_snapshot` requires `DisputeState::Created`
(`lib.rs:482-485`) which has already advanced to `SnapshotPosted`. There is no
re-post path. A successful fraud proof therefore strands the filer's deposited
fee (`dispute.fee_paid`) and the dispute with no recovery. Documented in code
(`lib.rs:478-479`) and tracked as bean `veridao-i4jm` (snapshot trust
hardening / re-post after void). **Irreversible transition** — flag for v1
acceptance or fix before mainnet TVL.

### ⚠️ H-6. No-coherent-juror round leaves pool surplus trapped

`lib.rs:1115-1119` — if `coherent_count == 0`, `share = 0` and the entire pool
(slashed stake + round fee + forfeited bonds) stays in the vault as "protocol
surplus" with no withdrawal instruction. The SPEC flags this for revisit
(SPEC §4.6 fn.10). Not exploitable, but value is permanently locked. Add a
sweep-to-treasury or burn path, or document the accepted loss.

### ⚠️ H-7. Snapshot fraud proof covers only the "duplicate Juror" class

`state.rs:282-290` doc + `lib.rs:576-579` — only a fraud proof showing two tree
leaves for the same Juror is verifiable on-chain. Wrong-stake / missing-Juror /
extra-Juror fraud requires the off-chain dataset and is left to a future richer
proof (hardening bean). Accepted for v1 per ADR-0003; the 1-day challenge window

- bond is the trust anchor, but a sophisticated poster can post a root with
  individually-valid-but-collectively-wrong leaves. Document the residual trust
  assumption.

---

## 1. Account & identity validation

### 1.1 Signer checks — ✅

Every privileged action binds to a `Signer` and checks identity:
`pause` `lib.rs:84-87`, `propose_unpause` `lib.rs:100-103`,
`propose_subaccord_update` `lib.rs:336-339`, `execute_subaccord_update` lands
permissionlessly (timelock is the gate, correct). Permissionless cranks
(`finalize_round`, `finalize_dispute`, `finalize_snapshot`, `execute_unpause`,
`claim_appeal_refund`, `draw`, `get_ruling`) intentionally take any `Signer`
caller — the state machine + time windows are the gate.

### 1.2 Ownership checks — ✅

All typed accounts use `Account<'info, T>` / `AccountLoader<'info, T>` / `Program<'info, _>`,
which enforce owner + discriminator at deserialization. `remaining_accounts`
paths verify via PDA re-derivation (`lib.rs:774-782`, `1038-1046`, `1071-1084`)
and `JurorStake::try_deserialize` (`lib.rs:787`) which checks the Accord
discriminator + owner. §9.3 satisfied.

### 1.3 Account data matching (has_one) — ✅

PDA seeds re-derive each account from its stored relationship fields, e.g.
`Round` from `[SEED_ROUND, dispute, current_round]` (`lib.rs:1838`,
`bump`-stored), `JurorStake` from `[SEED_JUROR_STAKE, subaccord, juror]`
(`lib.rs:1514`). Cross-account linkage is enforced by seed composition.

### 1.4 Type cosplay prevention — ✅

Anchor discriminators via `Account<T>` / `AccountLoader<T>` everywhere named;
manual `remaining_accounts` reads re-check length + discriminator
(`lib.rs:1085-1097`).

### 1.5 Reinitialization attacks — ✅

`init` (not `init_if_needed`) on all one-shot accounts: `Subaccord`
(`lib.rs:1476`), `Dispute` (`lib.rs:1651`), `Snapshot` (`lib.rs:1694`),
`Round` (`lib.rs:1835`), `PendingUpdate` (`lib.rs:1595`), `AppealBond`
(`lib.rs:1979`), `PauseState` (`lib.rs:1429`). The two `init_if_needed` uses
(`Stake.juror_stake` `lib.rs:1511`, `Stake.vault` `lib.rs:1529`) are legitimate
PDA-keyed top-up / ATA-creation patterns — the PDA seed (subaccord+juror)
prevents adversarial pre-init squatting.

### 1.6 Writable checks — ✅

`#[account(mut)]` / `mut` applied precisely where mutation occurs; Anchor
rejects writes to non-writable accounts at runtime.

---

## 2. PDA security

### 2.1 Canonical bumps only — ✅ (minor compute note)

Every account stores `bump` (`state.rs:48,62,85,143,170,186,205`) and
re-derives with `bump = X.bump`. `remaining_accounts` verification uses
`Pubkey::find_program_address` (`lib.rs:774`, `1038`, `1071`) rather than
`create_program_address` with the stored bump — correct (it must compute the
canonical bump to compare) but slightly more expensive than caching. Not a
security issue.

### 2.2 / 2.3 PDA sharing & seed collision — ✅

Seeds mix fixed `[u8; 32]` fields (risk_type, hashes), `Pubkey::as_ref()` (32
bytes), and `to_le_bytes()` fixed-width integers — no variable-length
concatenation ambiguity (`["AB","C"]` vs `["A","BC"]` footgun). Each seed prefix
is unique (`constants.rs:35-44`).

### 2.4 PDA purpose isolation — ✅

Vault, stake, dispute, round, snapshot, bond, update, pause each have distinct
seed prefixes and distinct PDAs.

---

## 3. Arithmetic & logic safety

### 3.1 Checked / saturating math — ✅ (one deliberate saturating sub)

Comprehensive `checked_*` on every financial path. The single saturating use is
`staker_count.saturating_sub(1)` on full unstake (`lib.rs:307`) — semantically
correct (counter must floor at 0). Slash is
`amount.checked_sub(slash_per_juror.min(amount)).unwrap_or(0)` (`lib.rs:1149`)
— `.min()` guarantees no underflow; `.unwrap_or(0)` is belt-and-suspenders.

### 3.2 Multiply before divide — ✅

Slash: `(alpha_bps * min_stake) / 10_000` (`lib.rs:1028-1031`) — mul before
div. Fee: `jurors_per_dispute * fee_per_juror` (`lib.rs:416-418`). Share:
`pool / coherent_count` (`lib.rs:1116`) — single division, correct.

### 3.3 Price slippage — N/A

No AMM/swap. Fee is exact-match (`require!(fee == required_fee)` `lib.rs:419`).

### 3.4 Lamport balance invariant — ✅

No manual lamport movement. All value movement via SPL `token::transfer`; all
rent reclamation via Anchor `close = caller` (`lib.rs:1624`).

---

## 4. Duplicate mutable account attacks — ✅

Named-account paths: distinct `associated_token::authority` constraints make
`juror_token_account` (authority=juror) and `vault` (authority=subaccord PDA)
structurally distinct in `stake`/`unstake` (`lib.rs:1521-1534`, `1565-1577`).
`remaining_accounts` paths: each slot is verified against a distinct expected
PDA (`lib.rs:774-782`, `1038-1084`); a duplicated `AccountInfo` would fail the
`try_borrow_mut_data` double-borrow at runtime. No `source != destination`
constraint needed because PDA derivation enforces distinctness.

---

## 5. CPI safety

### 5.1 Validate program IDs — ✅

Every CPI goes through `token_program: Program<'info, Token>` (hardcoded SPL
Token program ID via Anchor's `Program` guard). No user-supplied program ID.

### 5.2 Reload stale data after CPI — ✅

`vault.reload()` after every custodying transfer: `stake` `lib.rs:222`,
`create_dispute` `lib.rs:439`, `post_snapshot` `lib.rs:506`, `appeal`
`lib.rs:1248`. Fee-on-transfer delta accounting applied (`lib.rs:224-227`,
`441-443`, `508-510`, `1250-1252`). §21.6 satisfied.

### 5.3–5.8 Signer pass-through / SOL balance / post-CPI ownership / return values — ✅

CPI results propagated with `?` everywhere. PDA-signed sweeps use
`new_with_signer` with the Subaccord PDA seeds (`lib.rs:285-294`, `596-606`,
`617-628`, `659-670`, `1318-1329`) — signer privilege extended only to the
Subaccord PDA, never to a foreign signer.

---

## 6. Account storage & lifecycle

### 6.1 Storage rules — ✅

All sizes via `8 + T::INIT_SPACE` (`lib.rs:1431`, `1478`, `1513`, `1597`, `1653`,
`1696`, `1981`) or `8 + std::mem::size_of::<Round>()` for the `#[zero_copy]`
`Round` (`lib.rs:1837`). `size_of` is correct for `#[zero_copy]`/`Pod` types
(no Borsh, fixed `#[repr(C)]` layout, `state.rs:97-125`).

### 6.2 Rent exemption — ✅

Anchor `init` / `init_if_needed` fund to rent-exempt automatically.

### 6.3 Account closing — ✅

`ExecuteSubaccordUpdate` closes `pending_update` to `caller` (`lib.rs:1624`) —
Anchor's `close` zeroes data, moves lamports, reassigns to System. No manual
drain-only closes.

### 6.4 Sysvar verification — ✅

`Clock::get()?` (syscall) used throughout; no user-passed sysvar accounts.

---

## 7. Token-2022 compatibility — ⚠️ (see H-8 below)

See Known Limitations L-1. `staking_token` is per-Subaccord arbitrary
(`state.rs:20`); all transfers use `anchor_spl::token::transfer` (legacy Token
program hardcoded). A Subaccord that registers a Token-2022 mint will DoS on
every transfer. Not exploitable (fails closed) but a footgun.

---

## 8. Transaction model safety — ✅

No unbounded loops: `MAX_JURORS = 31` bounds the draw/finalize loops
(`lib.rs:746-750`, `962-967`, `1125-1157`); `MAX_OPTIONS = 32` bounds tally
(`lib.rs:961-967`). `create_dispute` validates `2..=MAX_OPTIONS` (`lib.rs:413`).

---

## 9. Safe Rust patterns

### 9.1–9.2 Vector init / unsafe — ✅

No `unsafe`. Array fills use indexed assignment into fixed arrays
(`lib.rs:446-449`, `824-826`).

### 9.3 remaining_accounts rigor — ✅

See §1.2. Both `draw` and `finalize_dispute` apply PDA re-derivation +
discriminator + field-match to every remaining account.

### 9.4 No unwrap on user-controlled paths — ✅ (justified unwraps)

The three `.unwrap()` calls (`lib.rs:1094`, `1135`, `1139`) are
`slice.try_into().unwrap()` for `[u8; 8]` / `[u8; 4]` **after** an explicit
length check (`lib.rs:1088`, `1131`). The slice length is statically guaranteed
by the preceding bounds check, so the conversion cannot panic on user input.
`.unwrap_or(0)` at `lib.rs:1149` and `971` are safe.

---

## 10. Curiosity principle — applied during this audit

The "what if same account twice / different owner / Token-2022 / silent CPI
success / malicious program ID / non-canonical bump" questions drove findings
H-1, H-5, L-1. See High-Risk Decisions and Known Limitations.

---

## 11. Oracle validation — 🟥 (see H-1)

The draw's "oracle" (VRF) is the highest-risk oracle path and is
not validated on-chain at all. See H-1.

---

## 12. Fee completeness — ✅

Fees custodyed atomically with the operation that triggers them: filer fee at
`create_dispute` (`lib.rs:428-438`), appeal fee+bond at `appeal`
(`lib.rs:1237-1247`), snapshot bond at `post_snapshot` (`lib.rs:495-505`). No
fee-bypass path identified.

---

## 13. Token dust & time-limited account DoS — ⚠️

Snapshot `Posted` accounts (`SnapshotStatus::Posted`) are time-limited (1-day
window). `finalize_snapshot` is permissionless after the window (`lib.rs:637`),
so expired snapshots are closeable-by-anyone implicitly via finalization — but
the `Snapshot` PDA is never `close`d (it stays on-chain holding rent). Stale
`Voided` snapshots (H-5) likewise persist. Minor rent leak; flag for a
close-snapshot cleanup instruction.

---

## 14. State management — coupled fields & counters — ✅

`staker_count` is maintained atomically with the 0↔positive stake transitions
(`lib.rs:242-249` increment, `lib.rs:305-308` decrement). `commit_count` /
`reveal_count` increment with each commit/reveal (`lib.rs:876-879`, `926-929`).
`active_draws` increments at `draw` (`lib.rs:797-803`), decrements at
`finalize_dispute` (`lib.rs:1151`, `1155-1156`) — see qedspec invariant
`active_draws_balanced`.

---

## 15. Shared position & pool logic — N/A

No share-transfer / liquidity-position movement between Jurors.

---

## 16. Clock & timing — ⚠️ (minor)

A single canonical time source (`Clock::get()?.unix_timestamp` for windows,
`Clock::get()?.slot` for timelocks) is used consistently. **Unit note:** review
windows are stored as `u64` seconds (`state.rs:26-28`) and cast `as i64` at
`lib.rs:809, 812, 815` before addition to the `i64` timestamp. If a Subaccord
configured a window `> i64::MAX` (absurd but unvalidated at `create_subaccord`),
the cast silently corrupts. Recommend bounding `*_window` at creation (§29.2).

---

## 17. Token / mint integrity — ⚠️

`staking_token` is accepted at `create_subaccord` with **no** validation of mint
close-authority, decimals, freeze authority, or Token-2022 extensions (§17, §23).
A malicious or misconfigured mint registered as a Subaccord's `staking_token`
poisons that Subaccord only (per-Subaccord isolation, ADR-0002) — but the
program gives no creation-time guard. Recommend a `require!` on
`mint.freeze_authority == None` (or `== subaccord`) and a Token-2022 extension
allowlist at `create_subaccord` (§23).

---

## 18. Input validation — protocol-level — ⚠️

`create_subaccord` validates `risk_type != [0;32]` (`lib.rs:161`) and
`max_appeals <= MAX_APPEALS` (`lib.rs:164-167`) but performs **no** bounds
checks on `min_stake`, `jurors_per_dispute` (could be 0 → division/panel-size
edge), `alpha_bps` (could exceed 10_000 → slash > min_stake), `fee_per_juror`,
or the `*_window` fields. Per §29.2 / §29.3, permissionless creation parameters
that affect protocol behavior should be bounded. Recommend: `jurors_per_dispute

> = 1`,`alpha_bps <= 10_000`, windows in`[MIN_WINDOW, MAX_WINDOW]`. Low blast
> radius (per-Subaccord) but each misconfigured Subaccord can trap user funds.

---

## 19. Type narrowing & integer safety — ✅

`panel as u64`, `coherent_count as u64`, `sub.alpha_bps as u64` — widening casts
on bounded values (panel ≤ 31, alpha_bps is u16). No silent narrowing.

---

## 20. Event logging — ✅

Structured `#[event]` types (`events.rs`) emitted on every state transition;
fixed-size fields (Pubkey, u64, u8, [u8;32]) except `JurorsDrawn.jurors: Vec<Pubkey>`
(`events.rs:90`) which is bounded by `MAX_JURORS`. No free-form log strings.

---

## 21. Reward accounting — N/A (with notes)

Not a yield/reward-accumulator protocol. The coherent-juror redistribution
(`lib.rs:1108-1157`) is a one-shot equal split of `(slash_total + round_fee +
forfeited_bonds) / coherent_count`, computed and applied in a single
transaction. No `reward_debt`, no accumulator, no retroactive rate — §21.1–21.5
do not apply. §21.6 (fee-on-transfer delta) is applied correctly (see §5.2).
§21.7 (rewards from principal) — the redistribution pool _does_ include slashed
principal from incoherent jurors (`lib.rs:1144-1150`), which is by design
(Kleros-inherited economics: incoherent stake is forfeited to coherent jurors,
not "yield from nowhere"). Document explicitly that the "yield" to coherent
jurors is funded by incoherent jurors' slashing, not by external yield.

---

## 22. Vault & pool architecture — ✅

The Subaccord PDA vault (`lib.rs:1528-1534`) has explicit withdrawal paths:
`unstake` (`lib.rs:284-295`), snapshot-bond return on finalize/challenge
(`lib.rs:595-628`, `659-670`), appeal-refund (`lib.rs:1318-1329`). No
deposit-only PDA vault. §22.1 satisfied. (H-6 flags the no-coherent-juror
surplus corner, not a missing path.)

---

## 23. Token-2022 extension validation at init — 🟥 L-1

No extension validation at `create_subaccord`. See §17 and Known Limitations.

---

## 24. Access control — lockup & admin rotation

§24.1 N/A (no separate claim-vs-unlock split; `unstake` is the only exit and is
correctly gated by `active_draws == 0` `lib.rs:268-271`). §24.2 — see H-2
(PauseState) and H-3 (Subaccord authority): neither implements the two-step
pattern.

---

## 25. BPF runtime — stack frame — ✅

`Dispute`, `Snapshot`, `Subaccord`, `AppealBond` are `Box<>`-wrapped in every
large context (`lib.rs:1657, 1686, 1692, 1700, 1731, 1736, 1742, 1783, 1789,
1822, 1828, 1833, 1857, 1863, 1881, 1887, 1905, 1911, 1934, 1940, 1969, 1985,
2019, 2024, 2031, 2057`). `Round` uses `AccountLoader` (zero-copy) due to size
(`lib.rs:1841`, `state.rs:92-97`). No 4096-byte stack risk identified.

---

## 26. State machine & lifecycle integrity — ✅ (with H-5 caveat)

Transitions are allowlisted per handler via explicit `require!(state == X)`:
`commit` (`lib.rs:855-858`), `reveal` (`lib.rs:899-902`), `finalize_round`
(`lib.rs:950-955`), `finalize_dispute` (`lib.rs:1001-1004`), `appeal`
(`lib.rs:1190-1193`), `post_snapshot` (`lib.rs:482-485`), `draw`
(`lib.rs:708-711`). Terminal `Final` is absorbing — no handler writes out of it
(`get_ruling` is read-only `lib.rs:1340-1342`). The `Voided` snapshot corner
(H-5) is the one place a non-terminal path dead-ends; that is an irreversibility
bug, not a transition-matrix bug. Timestamp sentinels use `u8::MAX` / `[0;32]`
on already-initialized arrays (`lib.rs:830-831`), not zero-valued timestamps —
§26.1 satisfied.

---

## 27. Slippage & fee ordering — N/A

No AMM. The single "slippage"-adjacent guard is the exact-fee match
(`lib.rs:419`), which compares against the authoritative on-chain fee.

---

## 28. Bonding curve & AMM — N/A

---

## 29. Permissionless init & user-controlled params — ⚠️ (see §18)

`create_subaccord` is permissionless and front-running-safe (PDA namespaced by
`[creator, risk_type]`, `lib.rs:1479` — no shared namespace capture). But
creator-controlled params are unbounded (§18): a Subaccord with
`jurors_per_dispute = 0` or `alpha_bps = 10_001` is accepted. Per §29.2 / §29.3,
add creation-time bounds. `propose/execute_subaccord_update` likewise applies
`UpdatePayload` values with no re-validation (`lib.rs:374-385`) — a timelocked
update to `alpha_bps = 99_999` would apply. Recommend validating in **both**
`propose_subaccord_update` and `execute_subaccord_update` (§29.3: "validate in
every write path").

---

## 30. Withdraw & drain safety — ✅

`unstake` is capped at `juror_stake.amount` (`lib.rs:272-275`); no over-withdraw.
The `amount` field is decremented atomically with the transfer (`lib.rs:297-302`).
No cumulative-cap pattern needed (single-shot withdrawal against a stored
balance).

---

## 31. Miscellaneous patterns

- §31.3 (unclosed accounts): `PendingUpdate` is closed (`lib.rs:1624`); `Voided`
  Snapshots and resolved `Round`s are not — minor rent leak, see §13.
- §31.6 (signer-as-new-account): N/A — all new accounts are PDAs.
- §31.7 (repeated privileged resets): `pause` correctly cancels any pending
  unpause on a fresh pause (`lib.rs:91`); `propose_unpause` re-arms the slot only
  while paused (`lib.rs:104`) — no indefinite extension. ✅

---

## Known Limitations (accepted for v1)

### L-1. Token-2022 mints will DoS on `token::transfer` (§7, §17, §23)

All nine `token::transfer` call sites (`lib.rs:209, 284, 428, 495, 563, 595, 617,
659, 1237, 1318`) hardcode the legacy SPL Token program. A Subaccord whose
`staking_token` is a Token-2022 mint will fail every transfer. **Mitigation
until fixed:** document that v1 Subaccords must use legacy-Token mints (e.g.
USDC), and reject Token-2022 mints at `create_subaccord` by checking
`staking_token.owner == Token::id()`.

### L-2. `staker_count` is a coarse gate, not a precise eligibility check

`state.rs:38-47` — `staker_count` tracks distinct stakers with `amount > 0`, not
`amount >= min_stake`. Precise eligibility is verified at `draw` against the
snapshot (`lib.rs:734-737`). Accepted per ADR-0003; document so callers do not
treat `staker_count` as a min-stake headcount.

### L-3. Off-chain sortition trust

The stake-weighted cumulative lookup is computed off-chain; on-chain `draw`
trusts the finalized snapshot root (ADR-0003). Combined with H-1 (unverified
VRF), the draw's integrity currently rests almost entirely on cranker honesty.
Both must be addressed before mainnet.

---

## Summary

| Severity            | Count | Items                                                                                            |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| 🟥 Critical finding | 3     | H-1 (VRF unverified), H-2 (pause authority immutable), H-5 (voided snapshot traps fee)           |
| ⚠️ High / Medium    | 4     | H-3 (one-step authority), H-4 (upgrade policy), H-6 (trapped surplus), H-7 (limited fraud proof) |
| ⚠️ Hardening        | 4     | §16 (window bounds), §17/§23 (mint validation), §18/§29 (param bounds), §13 (snapshot close)     |
| ✅ Satisfied        | —     | §1–§6, §8, §9, §12, §14, §20, §22, §25, §26, §30, §31                                            |

**Top three before any mainnet TVL:** fix H-1 (real VRF wiring),
H-2 (pause-authority rotation), and H-5 (voided-snapshot recovery / fee
return). The qedspec (`accord.qedspec`) codifies the economic invariants
(slash math, distinct draw, bond conservation, active_draws balance) as
permanent regression guards for the parts the audit marks satisfied.
