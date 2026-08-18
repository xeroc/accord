# 06 — Voting (`vote:*`)

Commit-reveal Schelling-point voting + the permissionless finalization cranks.
SDK surface: `@useaccord/sdk` → `methods/voting.ts`. On-chain: `programs/accord/src/lib.rs` (`commit`, `reveal`, `finalize_round`, `finalize_dispute`, `redraw`).

## Voting windows (per-Subaccord, frozen into `CaseTerms` at filing)

Each round has three sequential windows. `Round` stores the deadlines; the live
phase is derived from `Clock::unix_timestamp`:

```
draw_time ──review_window──► review_end ──commit_window──► commit_end ──reveal_window──► reveal_end
                              │ commit open               │ reveal open               │ finalize open
```

| Instruction        | Allowed when                                  | Rejects with        |
| ------------------ | --------------------------------------------- | ------------------- |
| `commit`           | `review_end ≤ now < commit_end`               | `CommitWindowClosed`|
| `reveal`           | `commit_end ≤ now < reveal_end` ∨ all committed | `RevealWindowClosed`|
| `finalize_round`   | `now ≥ reveal_end` ∨ all revealed            | `RoundNotFinalizable`|
| `finalize_dispute` | `now ≥ reveal_end + terms.appeal_window`      | `AppealWindowOpen`  |

> **Early reveal.** `reveal` also opens the instant every drawn juror has
> committed (`commit_count == juror_count`): the panel-full `commit` flips
> state straight to `Reveal`, so a fully-committed panel needn't idle out the
> rest of the commit window. Only the lower bound is relaxed — `reveal_end`
> and the appeal/finalize windows are unchanged.

Windows are set at Subaccord creation (`lifecycle:create-subaccord
--review-window/--commit-window/--reveal-window/--appeal-window`) and frozen per
dispute, so a 48h governance timelock cannot shift them mid-dispute.

## Command map

| Command                 | SDK fn            | Signs      | Cranker? |
| ----------------------- | ----------------- | ---------- | -------- |
| `vote:commit`           | `commit`          | **juror**  | no       |
| `vote:reveal`           | `reveal`          | **juror**  | no       |
| `vote:commit-hash`      | `commitHash`      | none       | — pure   |
| `vote:finalize-round`   | `finalizeRound`   | any caller | **yes**  |
| `vote:finalize-dispute` | `finalizeDispute` | any caller | **yes**  |
| `vote:redraw`           | `redraw`          | any caller | **yes**  |

Common flags: `--subaccord <addr>`, `--dispute <addr>`, `--round-idx <n>` (the
Round PDA is derived). Global flags (`--rpc/--keypair/--json/--dry-run/...`) apply.

**Vote encoding (ADR-0025).** `--vote` is a string that becomes a u64: an
option index for `Plurality` pools (`--vote 1`), or a decimal scalar for
`Median` pools (`--vote 123.45 --decimals 6` scales by 10^6). Integer strings
pass through as raw base units; `--decimals` (default `0` = no scaling) only
applies when `--vote` contains a `.`. SDK pure helpers: `encodeScalarVote` /
`decodeScalarVote` (default 6 decimals).

## `vote:commit` — hash(vote, salt, juror) on-chain

Computes `commitment = sha256(vote_le[8] ‖ salt[32] ‖ juror_pubkey[32])` — the
vote preimage is the 8-byte little-endian u64 (ADR-0025) — and stores it on
the juror's slot. `--vote` is an option index (`0..num_options`) for
`Plurality` pools, a decimal scalar (`--decimals`) for `Median` pools.
`--salt` is 32 bytes (`--salt 0x<64hex>` or `--salt random`, which prints the
generated salt so it can be reused at reveal). Prints `{ commitment }`.

> **Single-signer:** `commit` is signed by the drawn juror. The CLI's
> `--keypair` is the signer, so **the operator must run it with the juror's
> keypair** (`--keypair ~/juror.json`). For a hosted juror service, use the SDK
> with a separate signer instead.

```bash
# operator commits as the juror (note the juror keypair)
SALT=0x$(openssl rand -hex 32)
useaccord vote:commit \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --vote 1 --salt "$SALT" \
  --keypair ~/juror.json --json
# {"signature":"…","commitment":"ab12…(64 hex)"}

# Median (scalar) pool — decimal scalar scaled by 10^--decimals (ADR-0025)
useaccord vote:commit \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --vote 123.45 --decimals 6 --salt "$SALT" \
  --keypair ~/juror.json --json
```

Gates enforced on-chain: juror is drawn into the round (`NotDrawnJuror`), no
prior commit (`CommitAlreadyExists`), inside the commit window.

## `vote:reveal` — verify hash, record vote

Pass the **exact** `--vote` and `--salt` used at commit. The chain recomputes
`hashv(&[&vote_le[8], &salt, juror])` and checks it equals the stored
commitment (`RevealMismatch` on a mismatch — same `.`, same `--decimals` as
commit). Records the u64 vote — option index for `Plurality`, scalar base
units for `Median` (ADR-0025); no fee transfer at reveal (fees credit later at
`finalize_round`).

```bash
# MUST match the commit pair — wrong salt/vote/byte-order ⇒ RevealMismatch
useaccord vote:reveal \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --vote 1 --salt "$SALT" --keypair ~/juror.json --json
# {"signature":"…","round":"<round-pda>","salt":"<64hex>"}

# Median (scalar) pool — same decimal form as the commit (ADR-0025)
useaccord vote:reveal \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --vote 123.45 --decimals 6 --salt "$SALT" --keypair ~/juror.json --json
```

Gates: inside reveal window, a commit exists (`CommitMissing`), not already
revealed (`AlreadyRevealed`).

## `vote:commit-hash` — pure helper

Offline precompute of the 32-byte commitment (72-byte preimage =
`vote_le[8] ‖ salt[32] ‖ juror[32]`, ADR-0025). No RPC, no signer, no send.
Use to pre-sign, audit a stored commit, or double-check a reveal preimage.

```bash
useaccord vote:commit-hash --vote 1 --salt 0xa1b2…fe --juror 4zNd…9q
# {"commitment":"ab12…(64 hex)"}

# scalar form: --vote 123.45 --decimals 6 hashes 123_450_000 (ADR-0025)
useaccord vote:commit-hash --vote 123.45 --decimals 6 --salt 0xa1b2…fe --juror 4zNd…9q
```

## `vote:finalize-round` — tally + reveal-quorum check (cranker)

After `reveal_end` **or once every juror has revealed**, anyone tallies the round (ADR-0019 aggregation). **ADR-0021**
gates the tally on a reveal quorum
`reveal_count >= ceil(panel × reveal_threshold_bps / 10_000)`; **ADR-0026** additionally routes Plurality top-count ties to the redraw path:

- **Quorum met + decisive tally** → the aggregation's `result` written (winning
  option index for `Plurality`; the median of revealed scalars for `Median` —
  ADR-0025), each revealer credited `fees_earned += fee_per_juror` (ADR-0020),
  state → `RoundResolved`.
- **Shortfall or Plurality top-count tie** (≥2 options share the max count,
  ADR-0026) → no result, no fee credits, state → `RedrawEligible` (hand to
  `vote:redraw`). This kills zero-mandate tie-break rulings (CONCEPT-REVIEW §4.9).

`--remaining-accounts <auto|list>`: the panel's `JurorStake` PDAs (needed only
when `fee_per_juror > 0`). **The cranker automates this** when `now ≥ reveal_end` or all revealed.

```bash
useaccord vote:finalize-round \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --remaining-accounts auto --json
# {"signature":"…","round":"<round-pda>","remainingCount":3}
# quorum met + decisive → RoundResolved; round.result = option index / median (ADR-0025)
# shortfall OR plurality tie → RedrawEligible, no result (inspect via read:round; ADR-0026)

After `reveal_end + appeal_window` with no appeal, settles the **final round**:
slash incoherent/non-revealing jurors into `stake_delta`, redistribute the
coherent pool (slash + forfeited bonds), write `final_ruling`, state → `Final`.
Prior rounds settle separately via `settle:round`. **Cranker automates this.**

`--remaining-accounts`: `[panel JurorStake PDAs]` + one `AppealBond` PDA per
prior appeal (collapses to just the panel when there were no appeals).

```bash
useaccord vote:finalize-dispute \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --remaining-accounts auto --json
# {"signature":"…","round":"<round-pda>","remainingCount":3}
# state → Final; read the u64 ruling via dispute:ruling / read:dispute
```

## `vote:redraw` — shortfall reconvene (cranker, ADR-0021)

Callable only from `RedrawEligible`. `draw_attempt` is **orthogonal to
`round_idx`**: bumping it changes only the sortition seed (fresh seats), never
the panel size or the appeal budget.

- **Redraw** (`draw_attempt+1 < max_draw_attempts`): slash no-shows into
  `stake_delta`, release every drawn juror's `active_draws`/`slash_reserve`,
  bump `draw_attempt`, clear the round, reopen `Created`.
- **Fail** (`draw_attempt+1 ≥ max_draw_attempts`): same slash/release + prior
  rounds, refund the filer's remaining `fee_paid`, state → `Failed`. No-shows'
  accumulated slashes stand; appeal bonds stay claimable.

**Cranker automates this.** Filer's single fee deposit suffices across the whole
ladder — shortfall rounds pay nothing. The bumped `draw_attempt` salts the
sortition seed; see [05-vrf-draw.md](05-vrf-draw.md) for the seed/`draw_seat` math.

```bash
useaccord vote:redraw \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --remaining-accounts auto --json
# redraw  → {"state":"Created","draw_attempt":1}
# exhaust → {"state":"Failed","refund":"<lamports>"}
```

## Behavior notes & audit findings

- **Fee timing (ADR-0020):** `reveal` is **vote-recording only** — no SPL
  transfer, no fee credit at reveal. Revealers earn `fees_earned` at
  `finalize_round` (only when quorum met), withdrawn via `staking:withdraw-fees`.
  > The SDK `methods/voting.ts` doc-comment still describes the pre-0020
  > "reveal pays the fee / takes token accounts" model — it is stale; the
  > on-chain `reveal` (lib.rs:1246) takes no token accounts.
- **Reveal mismatch is silent:** a wrong salt, vote, or byte order recomputes a
  different hash and fails `RevealMismatch`. The operator **must** persist the
  exact `--vote`/`--salt` pair from `vote:commit`.
- **Juror = signer:** because the CLI uses one `--keypair`, run `commit`/`reveal`
  with the juror's keypair directly; the cranker and finalization cranks use the
  cranker's funded keypair.
- **Never pausable (ADR-0016):** `commit`, `reveal`, `finalize_round`,
  `finalize_dispute` are outside the circuit breaker — a pause cannot stall an
  in-flight vote.
- **NO_VOTE sentinel (ADR-0025):** votes/results/rulings are u64; `u64::MAX`
  (`NO_VOTE`, `0xffff…ffff`) marks "not revealed". Valid votes: option
  indexes `0..num_options` for `Plurality`; any scalar below the sentinel for
  `Median`. JSON output emits bigints as decimal strings (jq-safe).
