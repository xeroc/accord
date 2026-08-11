# Appeal — Escalation, Bond & Refund

The `appeal:*` commands escalate a resolved dispute to a larger panel and
reclaim a flipped bond. An appeal is **permissionless**: any caller opens the
next round at a `2N+1` panel (3 → 7 → 15 → 31), pays the new round's fee plus
an equal bond, and resets the dispute to `Created`. The bond is forfeited to
the coherent pool if the ruling holds, or reclaimable by the original
appellant if the appeal flips it. One pure helper quotes the cost; one crank
sweeps the refund.

## Commands

### `appeal:open` — open the next appeal round

`appeal` (lib.rs:1643). Opens `current_round + 1` at
`panel_size_for_round(current + 1)` jurors; the appellant pays `fee_new`
(= panel · `terms.fee_per_juror`) **plus** an equal bond, so
`total = 2 · fee_new`. The AppealBond PDA is seeded by the round **being
appealed** (the current round, pre-increment): `["bond", dispute, current_round]`.
Resets the dispute to `Created` for the fresh panel; `prior_result` (the ruling
the appellant seeks to flip) is recorded for flip detection at
`finalize_dispute`.

```bash
# Appeal the current round; bond == new-round fee, refunded only on a flip
useaccord appeal:open --dispute RokL…HEef
# → { signature, appealBond: "Bond…", newRound: 1 }

# File fresh evidence for the new round (32-byte commitment). Omit to carry
# forward prior evidence — the [0u8;32] sentinel means "nothing new this round"
useaccord appeal:open --dispute RokL…HEef --evidence 0xabc…32bytes

# Different appellant than the loaded wallet (dry-run to inspect the ix)
useaccord appeal:open --dispute RokL…HEef --appellant 4Hpge… --dry-run
```

Flags:

- `--dispute <addr>` — the Dispute PDA to appeal (required).
- `--appellant <addr>` — appellant; defaults to the loaded `--keypair` wallet.
- `--evidence <hex>` — per-round evidence commitment, 32 bytes (optional `0x`
  prefix). Omit for the `[0u8;32]` sentinel (carry forward prior evidence, add
  none).

**Reverts** unless the dispute is `RoundResolved` (`InvalidState`); if
`current_round >= terms.max_appeals` (`MaxAppealsReached`, default 3); if
`now >= round.reveal_end + terms.appeal_window` (`AppealWindowClosed`,
default 3 days); or if `staker_count < panel_new` (`InsufficientJurors`). The
cap, panel base, and fee are the **filing-time** values frozen on the dispute's
`CaseTerms` — a 48h parameter update cannot shift them mid-dispute. SDK:
`methods.appeal(accounts, newEvidenceHash)` (appeal.ts:199).

### `appeal:cost` — pure pre-check

Compute the panel + fee + bond for opening round `--current-round + 1` with no
chain access. Panel follows the `2N+1` ladder (3 → 7 → 15 → 31); `total` =
new-round fee + equal bond. This is the exact amount `appeal:open` transfers —
use it to pre-fund the appellant before filing.

```bash
useaccord appeal:cost --current-round 0 --fee-per-juror 1000000
# → { newRound: 1, panel: 7, fee: 7000000, bond: 7000000, total: 14000000 }

useaccord appeal:cost --current-round 2 --fee-per-juror 2500
# → { newRound: 3, panel: 31, fee: 77500, bond: 77500, total: 155000 }
```

Flags:

- `--current-round <int>` — the round index being appealed **from**
  (`dispute.current_round`).
- `--fee-per-juror <int>` — per-juror fee in base units (e.g. lamports).

Pure — no signer, no send. Errors on panel overflow (round index ≥ 31, where
`panel_size_for_round` exceeds `MAX_JURORS`). SDK: `appealCost(currentRound,
feePerJuror)` (appeal.ts:74).

### `appeal:claim-refund` — sweep a flipped bond

`claim_appeal_refund` (lib.rs:1772). After `finalize_dispute` (lib.rs:1459), if
the appeal **flipped** the prior ruling, the bond is reclaimable. `--round-idx`
selects the appeal (the round that was appealed — the AppealBond PDA seed). The
refund lands in the original appellant's `feeToken` ATA (owner checked
on-chain); `--claimant-token-account` defaults to the loaded wallet's ATA (the
single-signer model — the appellant reclaims their own bond). Idempotent: the
bond is zeroed on payout, so re-invocation is a no-op.

```bash
useaccord appeal:claim-refund --dispute RokL…HEef --round-idx 0
# → { signature, appealBond: "Bond…", roundIdx: 0 }

# Explicit ATA (advanced / non-custodial)
useaccord appeal:claim-refund --dispute RokL…HEef --round-idx 1 --claimant-token-account 7VtW…
```

Flags:

- `--dispute <addr>` — the Dispute PDA whose appeal bond to claim (required).
- `--round-idx <int>` — the round index that was appealed (AppealBond PDA seed,
  required).
- `--claimant-token-account <addr>` — appellant's `feeToken` ATA (refund
  destination); defaults to the loaded wallet's ATA.

SDK: `methods.claimAppealRefund(accounts, roundIdx)` (appeal.ts:215).

## Appeal ladder

`panel_size_for_round(k) = (INITIAL_NUM_JURORS + 1) · 2^k − 1`, capped at
`MAX_JURORS`. With the default `INITIAL_NUM_JURORS = 3` and `max_appeals = 3`:

```
round 0    round 1     round 2      round 3
  3   ──►   7    ──►   15    ──►   31
        appeal       appeal        appeal
       (bond)       (bond)        (bond)
```

Each appeal opens the next rung; `current_round >= terms.max_appeals` blocks
further appeals. The bond equals the new round's fee and is forfeited (to the
coherent pool) if the ruling holds, or refunded (via `claim_refund`) if the
appeal flips it.

## SDK functions

| CLI command | SDK fn | Source |
|---|---|---|
| `appeal:open` | `methods.appeal` | appeal.ts:199 |
| `appeal:cost` | `appealCost` | appeal.ts:74 |
| `appeal:claim-refund` | `methods.claimAppealRefund` | appeal.ts:215 |
| (panel math) | `panelSizeForRound` | constants.ts |
| (gate) | `canAppeal` | appeal.ts:87 |
| (PDA) | `findAppealBondPda` | appeal.ts:108 |
