# Synod — Security Checklist

> Applied per the **safe-solana-builder** `shared-base.md` rule set (sections 1–31).
> Risk level: **🟠 High** — holds party escrow (stake `S` × up to 7 parties per
> case), single CPI into Accord `create_dispute`, no admin keys, no upgrade
> authority beyond the deploy key. No juror collateral ever touches Synod
> (that stays in Accord's `stake_vault`).
>
> **Status: SEED (v1, bean accord-34zj).** The gate map below is grounded in
> the code as built; the full 31-section audit pass has NOT run yet — treat
> every ✅ as "gate exists and is covered by a LiteSVM test", not as audited.
> `synod.qedspec` is the regression-guard authority for the four guarantee
> families (roster gates, vault conservation, idempotent payouts,
> single-dispute binding).
>
> Source of truth: `src/lib.rs`, `src/state.rs`, `src/error.rs`,
> `src/constants.rs`, `src/instructions/*.rs`.
> Status legend: ✅ satisfied · ⚠️ partial / known gap · 🟥 finding.

---

## Trust model & accepted risks

| Item | Decision | Rationale |
|---|---|---|
| party == juror overlap | ⚠️ **Accepted risk** | Draw-time exclusion is structurally impossible against stake-weighted MST sortition; outvoting one seat is cheap and appeals are open (SPEC §Economics). Do NOT add draw exclusion. |
| Passive appeals | ✅ By design | Anyone appeals directly at Accord (ADR-0004). Synod never funds, matches, or tracks appeals — `claim` keys off the final ruling whenever it lands. No default judgment, no ex parte. |
| Evidence daemon grouping | ⚠️ **Out of scope** | Bean `accord-ybuq`. v1 commits to raw per-party evidence hashes at `join`; the multi-bundle manifest verification lands with the daemon work. |
| Fee-on-transfer mints | ✅ Gated | `join` credits only the vault delta and requires it to equal `S` (`StakeTransferShortfall`) — a fee mint simply cannot join. |
| Vault dust | ⚠️ Accepted | A donor can airdrop tokens into the case vault. Nothing bricks (no vault-equality checks on the payout paths); the neutral-path LAST claimant sweeps the dust out. |
| `open_case` griefing | ✅ By construction | Opening a case costs the opener rent; ignoring it (silence) refunds everyone at the deadline. Spam-safe: silence is a safe strategy for the named. |
| Canonical keypair | ✅ Provisioned | `GdV5rbRd…` — multisig custody outside git (same drill as accord/canon, commit `810dbdd`/`d6ce597` lineage). |

## Instruction gate map (as built)

| Instruction | State gate | Auth gate | Arithmetic | Coverage |
|---|---|---|---|---|
| `open_case` | fresh PDA (`init`) | permissionless; opener = `parties[0]` | `2..=7` distinct; `N·S > fee` (checked mul); fee frozen via `Subaccord::filing_fee()` | LiteSVM 8 tests |
| `join` | `Opening` (constraint) | signer == `parties[i]`, unjoined bit | vault delta == `S` (fee-on-transfer defense); `now < join_deadline` strict | LiteSVM 5 tests |
| `file_dispute` | `Opening` check-and-set → `Live` | permissionless | full-roster bitmask (`(1<<N)-1`); dispute PDA re-derived (`accord::dispute_pda(case, 0)`); CPI `remaining_accounts` program-id checked | LiteSVM 5 tests (+1 ignored: LiteSVM rent-payer quirk, e2e validates) |
| `refund_roster_miss` | `Opening` + `now ≥ join_deadline` + roster incomplete (check-and-set → `Closed`) | destination owner == `parties[i]`; joined bit; mint check | `paid_out` bit set-once (replay no-op) | LiteSVM (payout suite) |
| `claim` | `Live`; dispute `Final`/`Failed` only | destination owner == `parties[i]`; mint check; `r ≤ N` (`InvalidRuling`) | winner `N·S − fee` one-shot; neutral `⌊pot/N⌋` + last-claimant drain; Failed `S` | LiteSVM (payout suite) |

## Payout safety (the load-bearing invariants)

1. **Pull-only, per-party** — every payout credits the token account whose
   *owner* is `parties[i]`; an `associated_token` constraint can't express the
   dynamic 7-slot authority, so mint + owner are handler-checked
   (`WrongMint`/`NotNamedParty`). A missing party ATA can never block another
   party's claim.
2. **Idempotency** — `paid_out` bits are set-once; the replay no-op runs
   BEFORE the state gate so paid parties replay no-ops even on a `Closed`
   case. No double-pay path exists (see `synod.qedspec` `paid_bits_monotonic`).
3. **Case-PDA signing** — every vault outflow uses `invoke_signed` seeds
   `["case", opener, nonce, bump]` where the seeds constraint re-derives the
   case PDA (opener + nonce are untrusted inputs validated by the PDA itself).
4. **Single dispute binding** — `case.dispute` is written exactly once
   (`file_dispute`, requires `bound` sentinel semantics via state
   check-and-set); `claim` requires `case.dispute == dispute.key()`.

## Audit findings

None recorded — this is the seed pass. Findings land here with severity IDs
per the accord checklist format as the audit phases run.

## Pending (next audit pass)

- [ ] Full 31-section safe-solana-builder sweep.
- [ ] `qedgen stamp` binding of the .qedspec to the deployed handlers
      (unblocks the vacuous-lowering placeholders).
- [ ] CU budget profiling per instruction (safe-solana-builder closure rule).
- [ ] Surfpool e2e green run incl. the file_dispute happy path the LiteSVM
      rent-payer quirk ignores (bean `accord-al8h`).
