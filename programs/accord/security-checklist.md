# Accord — Security Checklist

> Applied per the **safe-solana-builder** `shared-base.md` rule set (sections 1–31).
> Risk level: **🔴 Critical** — vaults holding staked collateral, multi-CPI (VRF,
> Arbitrable), admin keys (Subaccord authority, pause authority, upgrade
> authority), large TVL potential.
>
> Source of truth: `src/lib.rs`, `src/state.rs`, `src/errors.rs`,
> `src/constants.rs`, `src/events.rs`.
> Status legend: ✅ satisfied · ⚠️ partial / known gap · 🟥 finding.
>
> **Audit reports:** `reports/SUMMARY.md` is the authoritative finding index.
> Line numbers are omitted here (they drift on every refactor); grep for the
> function/symbol name instead.

---

## Resolved findings (from previous codebase — no longer apply)

| Old finding | Resolution |
|---|---|
| ~~Unverified caller-supplied VRF~~ | **Resolved.** `request_vrf` CPIs the real VRF oracle; `commit_vrf_callback` is signer-gated to `VRF_PROGRAM_IDENTITY`. |
| ~~Voided snapshot stalls dispute~~ | **Resolved.** No snapshot step exists — ADR-0012 accumulator replaced it entirely. |
| ~~Snapshot fraud proof limited~~ | **Resolved.** No snapshot system. The Merkle-Sum Tree authenticates stake-weighted ranges by construction. |

---

## Audit findings (this codebase — see `reports/` for detail)

| ID | Severity | Finding | Status |
|---|---|---|---|
| C-1 | 🔴 Critical | `cancel_dispute` drained shared `fee_vault` | ✅ Fixed — refunds `fee_paid` only |
| H-1 | 🟠 High | `execute_subaccord_update` skipped param validation | ✅ Fixed — `validate_update_payload` at propose + execute |
| H-2 | 🟠 High | `withdraw_fees` no vault solvency check | ✅ Fixed — capped at vault balance, remainder preserved |
| H-3 | 🟠 High | No-coherent-juror round trapped fee pool | ✅ Fixed — pools go to revealers (not all jurors); zero-reveal surplus trapped as protocol revenue (bean accord-aqmw) |
| H-4 | 🟠 High | Appeal fee double-refund on Failed (`fee_paid` + `AppealBond.amount`) | ✅ Fixed — `fee_paid` round-0 only; `claim_appeal_refund` returns bond only (bean accord-xftx) |
| M-1 | 🟡 Medium | `request_withdraw` reset timelock on repeat | ✅ Fixed — rejects while pending |
| M-2 | 🟡 Medium | Raw-offset `remaining_accounts` no owner check | ✅ Fixed — `require!(owner == &crate::ID)` at all 9 sites |
| L-1 | 🟢 Low | One-step Subaccord authority rotation | ⚠️ Accepted — timelock mitigates |
| L-2 | 🟢 Low | `initialize_pause` frontrunnable | ⚠️ Accepted — bundle with deploy |
| L-3 | 🟢 Low | No close path for terminal disputes | ⚠️ Accepted — rent locked |
| L-4 | 🟢 Low | No mint validation at registration | ✅ Fixed — `Account<Mint>` in context |
| L-5 | 🟢 Low | Legacy Token only (no Token-2022) | ⚠️ Accepted — fails closed |

---

## High-Risk Decisions (admin keys, upgrade authority, irreversible transitions)

### ⚠️ PauseState authority is immutable — no rotation path

`initialize_pause` sets the authority once; no instruction rotates it.
Key loss = permanent inability to pause; key compromise = indefinite freeze
(timelocked unpause recovers from freeze, not from authority loss).
ADR-0007's Squads-multisig mitigates likelihood. Document the multisig-only
recovery path explicitly.

### ⚠️ Subaccord authority rotation is one-step

`UpdatePayload::Authority(v)` applies directly on execute (no accept step).
Mitigation: the 48h timelock gives stakers a window to exit. Acceptable for v1.

### ⚠️ Program upgrade authority is off-chain policy only

BPF upgrade authority cannot be constrained on-chain. ADR-0007 mandates
Squads multisig → post-audit freeze (`None`). Operational invariant.

---

## 1. Account & identity validation

### 1.1 Signer checks — ✅

Every privileged action binds to a `Signer` + identity check (`pause`,
`propose_unpause`, `propose_subaccord_update`). Permissionless cranks
(`finalize_round`, `finalize_dispute`, `execute_unpause`,
`claim_appeal_refund`, `draw_seat`, `get_ruling`, `redraw`, `settle_round`,
`cancel_dispute`) take any `Signer` — the state machine + time windows gate.

### 1.2 Ownership checks — ✅

Named accounts: `Account<T>` / `AccountLoader<T>` / `Program<T>` enforce
owner + discriminator at deserialization. `remaining_accounts`: PDA
re-derivation + owner check (`require!(owner == &crate::ID)`) at all sites
(M-2 fix).

### 1.3 Account data matching — ✅

PDA seeds re-derive each account from stored relationship fields.

### 1.4 Type cosplay — ✅

Anchor discriminators everywhere named; `remaining_accounts` checked via
PDA derivation + owner check.

### 1.5 Reinitialization — ✅

`init` on all one-shot accounts. The two `init_if_needed` uses
(`JurorStake`, `stake_vault`) are legitimate PDA-keyed top-up patterns.

### 1.6 Writable — ✅

`mut` applied precisely where mutation occurs.

---

## 2. PDA security — ✅

Canonical bumps stored and reused. Seeds use fixed-width types (no
concatenation ambiguity). Each PDA type has a distinct seed prefix.

---

## 3. Arithmetic & logic safety — ✅

`checked_*` / `saturating_*` throughout. Multiply-before-divide on all
financial paths. No AMM/swap — fee is exact-match (`require!(fee == required_fee)`).
Slash is ledger-only via `stake_delta` (ADR-0020) — `stake_vault` balance is
invariant under slash + redistribution.

---

## 4. Duplicate mutable account attacks — ✅

Distinct `associated_token::authority` constraints make all token-account
pairs structurally distinct. PDA derivation enforces distinctness for
`remaining_accounts`.

---

## 5. CPI safety — ✅

Program IDs hardcoded via `Program<T>`. `reload()` after every custodying
transfer. Fee-on-transfer delta accounting on stake/create_dispute/appeal.
PDA-signed sweeps extend signer privilege only to the Subaccord PDA.

---

## 6. Account storage & lifecycle — ✅

Sizes via `8 + T::INIT_SPACE` or `8 + size_of::<Round>()` (zero-copy).
Anchor `init` funds rent-exempt. `close = caller` on `PendingUpdate`.

---

## 7. Token compatibility — ⚠️ (L-5)

Legacy SPL Token only (`Program<'info, Token>`). Token-2022 mints are
rejected by the `Account<Mint>` ownership check at `create_subaccord` (L-4
fix). A future migration to `Interface<TokenInterface>` +
`transfer_checked` is the forward-compat path.

---

## 8. Transaction model safety — ✅

`MAX_JURORS = 31` and `MAX_OPTIONS = 32` bound all loops.
`create_dispute` validates `2..=MAX_OPTIONS`.

---

## 9. Safe Rust patterns — ✅

No `unsafe`. No `unwrap()`/`expect()` on user-controlled paths — all
`.unwrap()` calls are on statically-sized slices after explicit length
checks. `remaining_accounts` apply PDA + owner + length checks (M-2).

---

## 10. Curiosity principle — applied

The "what if same account twice / different owner / Token-2022 / silent CPI
success / malicious program ID / non-canonical bump" questions drove this
audit's findings. See `reports/` for details.
