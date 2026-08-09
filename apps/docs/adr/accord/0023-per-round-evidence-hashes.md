# Per-round evidence hashes — evidence-on-appeal

The on-chain evidence commitment is **per-round**, not frozen at filing.
`Dispute.evidence_hash: [u8; 32]` becomes
`Dispute.evidence_hashes: [[u8; 32]; MAX_APPEALS + 1]` (4 slots, rounds 0–3).
`create_dispute` writes slot `[0]`; each `appeal` may write a new hash into the
next slot. Round-N jurors receive the accumulated evidence for
`evidence_hashes[0..=N]`. A `[0u8; 32]` sentinel at any slot means "no new
evidence this round" — jurors reuse the prior rounds' evidence.

This is the v1 substitute for full two-party disputes. Round-1 evidence is
one-sided (the filer's claim + structural context); counter-evidence naturally
arrives when someone appeals. The current single frozen hash cannot represent
that, so appeals were evidence-blind. Per-round hashes give the larger appeal
panel the new material without a second on-chain party model.

## Context

ADR-0006 set a single on-chain `evidence_hash` and ADR-0017 fixed its content
as `sha256(manifest.yaml)`. That commits the **filer's** evidence package. But
the Accord is party-agnostic and permissionless to appeal (ADR-0004): anyone
may escalate a resolved round to a `2N+1` panel. A larger panel re-judging the
_same_ one-sided evidence can only re-confirm it — there was no channel for the
appeal to introduce material the filer did not surface.

Full two-party disputes (a named respondent, counter-claims, a reply period)
are a large surface (party set, service of process, a second evidence window)
deferred beyond v1. Per-round hashes are the minimal struct change that delivers
evidence-on-appeal now: one slot per round, an optional new hash at each appeal,
the evidence daemon delivers the accumulated set to the drawn jurors.

Abuse is bounded by the existing cost ladder: appeal panels grow as
`(J+1)·2^k − 1` and each appeal posts a bond (ADR-0004), so spam-introducing
evidence is as expensive as spam-appealing — already priced in. `MAX_APPEALS`
(= 3) bounds the array; the `current_round < max_appeals` gate (which may be
stricter, per Subaccord) bounds the writable slots.

## Decision

1. **`Dispute.evidence_hashes: [[u8; 32]; MAX_APPEALS + 1]`** replaces
   `evidence_hash: [u8; 32]`. `MAX_APPEALS == 3` ⇒ 4 slots (rounds 0–3), a
   96-byte growth (3 × 32) over the single hash. Pre-deployment (greenfield):
   no on-chain migration.
2. **`create_dispute` arg unchanged in name and type:** the filer still passes
   `evidence_hash: [u8; 32]`; the handler stores it at `evidence_hashes[0]`.
   Remaining slots are zero-initialized by Anchor. Existing Arbitrables that
   only read round-0 evidence are unaffected.
3. **`appeal` gains a `new_evidence_hash: [u8; 32]` argument.** The handler
   stores it at `evidence_hashes[(current_round + 1) as usize]` (the round the
   appeal opens). `current_round` is incremented in the same instruction, so
   the slot is written for the _new_ round before its draw.
4. **`[0u8; 32]` is the "no new evidence" sentinel.** A zero hash at slot `k`
   means round-`k` jurors reuse the accumulated evidence from rounds `0..k`.
   The filer's round-0 slot is never the sentinel — `create_dispute` requires a
   non-zero commitment (an all-zero manifest hash is not a valid ADR-0017
   root).
5. **Evidence delivery is cumulative.** The daemon (ADR-0011) delivers every
   non-zero `evidence_hashes[0..=round]` to a juror drawn in `round`. A juror
   drawn in round 2 with hashes at `[0]` and `[2]` (sentinel at `[1]`)
   receives the round-0 and round-2 packages; the sentinel contributes nothing
   new. Delivery and manifest packaging are the daemon's concern
   ([`EVIDENCE-FORMAT.md`](../../../evidence-daemon/EVIDENCE-FORMAT.md)); this
   ADR changes only the on-chain slot array and the `appeal` argument.
6. **`get_ruling` is unaffected.** It reads `final_ruling`, never evidence;
   Arbitrables that consume only the ruling see no change.

## Considered Options

**How to represent the per-round set.**

- **Single hash, evidence-blind appeals (status quo).** Rejected — a larger
  panel re-judging identical one-sided evidence cannot incorporate new material;
  the appeal safety valve (ADR-0004) is weakened for any dispute where the
  missing party has relevant evidence.

- **Fixed-size array `[[u8; 32]; MAX_APPEALS + 1]` (chosen).** Keeps the
  `Dispute` account fixed-size (no `Box`, no realloc, `InitSpace`-derivable);
  the slot index falls out of `current_round` for free; the sentinel reuses
  prior evidence without a separate "inherit previous" flag. Bounded by
  `MAX_APPEALS`, which already bounds the panel ladder.

- **`Vec<[u8; 32]>` / heap on the account.** Rejected — a `Vec` makes `Dispute`
  variable-size, forcing realloc and a `Box` and breaking the fixed-size
  `InitSpace` invariant the layout relies on. The number of rounds is already
  bounded by `MAX_APPEALS`; a heap growable is unbounded complexity for a
  bounded problem.

- **A separate `DisputeEvidence` PDA per round.** Rejected — one PDA per round
  is more accounts, more rent, more CPI surface, and a derivation scheme to
  invent, all to avoid 96 bytes on an account that already exists. The array is
  cheaper and simpler.

**Where the appeal's new hash comes from / whether it is optional.**

- **Required new hash on every appeal.** Rejected — forces an appellant with no
  new evidence to fabricate or re-submit a package, polluting the array with
  duplicate commitments.

- **Optional via sentinel `[0u8; 32]` (chosen).** The appellant passes the
  sentinel to say "appeal on the existing evidence"; a real hash introduces new
  material. Zero is never a valid ADR-0017 manifest root, so it is a free,
  unambiguous sentinel.

**Indexing.**

- **Slot = `current_round + 1` at appeal time (chosen).** The appeal opens round
  `current_round + 1`; writing that round's slot in the same instruction keeps
  the evidence in lockstep with the panel that will judge it. Round 0 is filing.

## Consequences

- **`Dispute` grows by 96 bytes** (3 × 32). `Dispute::INIT_SPACE` and the
  `8 + Dispute::INIT_SPACE` rent at `create_dispute` rise accordingly. The
  manual `layout` offset consts slice `JurorStake` / `AppealBond`, **not**
  `Dispute`, so there is no layout-const drift; the `INIT_SPACE` assert and
  `layout_tests::offsets_match_borsh` still pass (they do not slice `Dispute`).
  No on-chain migration: the program is pre-deployment (greenfield).

- **`Dispute.evidence_hash` is a breaking rename + resize.** Every reader of
  the old field (SDK decoder, layout tests, LiteSVM fixtures, the daemon's
  chain reader) must move to `evidence_hashes`. Tracked in the sibling code,
  SDK, daemon, and test beans (`accord-pwa9`, `accord-v84s`, `accord-xq40`,
  `accord-azyd`).

- **`appeal` signature changes** — it gains `new_evidence_hash: [u8; 32]`. This
  is a breaking change to the instruction's `#[instruction]` discriminator
  args; the SDK facade and the `Appeal` account context's `#[instruction]`
  attribute are regenerated (`accord-v84s`).

- **Layout-coupled** with any other bean that resizes `Dispute`. No in-flight
  bean resizes `Dispute` concurrently (verified at dispatch: `accord-pwa9` is
  the sole `Dispute` resize in this milestone).

- **Amends ADR-0006 / ADR-0017** — the on-chain evidence surface is no longer
  one hash, it is one hash _per round_. The "one hash" discipline of ADR-0006
  holds _per round_; ADR-0017's `sha256(manifest.yaml)` remains the content of
  each non-sentinel slot. Supersedes nothing — the round-0 commitment is
  unchanged.

- **Backward compatibility for Arbitrables.** `create_dispute`'s filer-facing
  arg is unchanged; `get_ruling` is unchanged. Arbitrables that read only the
  round-0 evidence (via the daemon) keep working. An Arbitrable that wants the
  appeal's new evidence reads the accumulated slots off-chain.

- **Evidence daemon delivers a cumulative set.** A juror drawn in round N
  receives every non-zero `evidence_hashes[0..=N]` (separate packages, matching
  the per-hash verification model — one `sha256(manifest.yaml)` check per
  package). The daemon change and `EVIDENCE-FORMAT.md` multi-manifest packaging
  are tracked in `accord-xq40` / `accord-lg3l`.

- **Sentinel is load-bearing.** `[0u8; 32]` means "inherit prior rounds'; this
  round adds nothing." The daemon skips zero slots; the on-chain `appeal`
  handler writes the caller's hash verbatim (it does **not** reject the
  sentinel — the appellant may legitimately appeal on the existing evidence).

## References

- ADR-0006 — evidence model (on-chain hash, trusted operator); amended here to
  "one hash per round."
- ADR-0017 — evidence data format (`manifest.yaml` Merkle root); remains the
  content of each non-sentinel slot.
- ADR-0011 — evidence operator daemon (transport/delivery).
- ADR-0004 — party-agnostic permissionless appeal; this ADR gives appeals an
  evidence channel.
- ADR-0019 — fixed round-0 panel (`INITIAL_NUM_JURORS`) and the appeal panel
  ladder whose cost bounds evidence-spam.
- [`apps/evidence-daemon/EVIDENCE-FORMAT.md`](../../../evidence-daemon/EVIDENCE-FORMAT.md) — manifest format and (post `accord-lg3l`) multi-manifest delivery.
- `CONTEXT.md` — Dispute, Appeal, Evidence Operator.
- `programs/accord/src/state.rs` — `Dispute.evidence_hashes`; `programs/accord/src/constants.rs` — `MAX_APPEALS`.
