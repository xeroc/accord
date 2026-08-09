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
| `reveal`           | `commit_end ≤ now < reveal_end`               | `RevealWindowClosed`|
| `finalize_round`   | `now ≥ reveal_end`                            | `RoundNotFinalizable`|
| `finalize_dispute` | `now ≥ reveal_end + terms.appeal_window`      | `AppealWindowOpen`  |

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

## `vote:commit` — hash(vote, salt, juror) on-chain

Computes `commitment = sha256(vote_byte ‖ salt[32] ‖ juror_pubkey[32])` and
stores it on the juror's slot. `--vote` is an option index (`0..num_options`);
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
```

Gates enforced on-chain: juror is drawn into the round (`NotDrawnJuror`), no
prior commit (`CommitAlreadyExists`), inside the commit window.

## `vote:reveal` — verify hash, record vote

Pass the **exact** `--vote` and `--salt` used at commit. The chain recomputes
`hashv(&[&[vote], &salt, juror])` and checks it equals the stored commitment
(`RevealMismatch` on a mismatch). Records the vote; no fee transfer at reveal
(fees credit later at `finalize_round`).

```bash
# MUST match the commit pair — wrong salt/vote/byte-order ⇒ RevealMismatch
useaccord vote:reveal \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --vote 1 --salt "$SALT" --keypair ~/juror.json --json
# {"signature":"…","round_idx":0,"vote":1}
```

Gates: inside reveal window, a commit exists (`CommitMissing`), not already
revealed (`AlreadyRevealed`).

## `vote:commit-hash` — pure helper

Offline precompute of the 32-byte commitment. No RPC, no signer, no send. Use to
pre-sign, audit a stored commit, or double-check a reveal preimage.

```bash
useaccord vote:commit-hash --vote 1 --salt 0xa1b2…fe --juror 4zNd…9q
# {"commitment":"ab12…(64 hex)"}
```

## `vote:finalize-round` — tally + reveal-quorum check (cranker)

After `reveal_end`, anyone tallies the round (ADR-0019 aggregation). **ADR-0021**
gates the tally on a reveal quorum
`reveal_count >= ceil(panel × reveal_threshold_bps / 10_000)`:

- **Quorum met** → plurality `result` written, each revealer credited
  `fees_earned += fee_per_juror` (ADR-0020), state → `RoundResolved`.
- **Shortfall** → no result, no fee credits, state → `RedrawEligible` (hand to
  `vote:redraw`). This kills zero-mandate tie-break rulings (CONCEPT-REVIEW §4.9).

`--remaining-accounts <auto|list>`: the panel's `JurorStake` PDAs (needed only
when `fee_per_juror > 0`). **The cranker automates this** when `now ≥ reveal_end`.

```bash
useaccord vote:finalize-round \
  --subaccord 7xKXtw...kZw --dispute 9pQDR...eY7 --round-idx 0 \
  --remaining-accounts auto --json
# quorum met  → {"state":"RoundResolved","result":1}
# shortfall   → {"state":"RedrawEligible","result":null}
```

## `vote:finalize-dispute` — write ruling + settle final round (cranker)

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
# {"state":"Final","final_ruling":1,"finalized_at":1723…}
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
- **NO_VOTE sentinel:** `u8::MAX` (255) marks "not revealed"; option indices are
  valid only `0..num_options`.
