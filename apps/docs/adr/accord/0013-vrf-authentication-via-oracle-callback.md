# VRF authentication via oracle callback — supersedes the ADR-0009 caller-commit VRF

## Status

**Accepted.** Records the as-built VRF security architecture. Supersedes the
caller-supplied `commit_vrf(vrf_result)` design in **ADR-0009 §2** (the
commit/retry framing) and the "oracle-verified VRF … still deferred" consequence
in ADR-0009, and the `commit_vrf(vrf_result)` rationale in the **ADR-0008
addendum**. The split-transaction rationale those sections advance is _retained_
— the oracle callback **is** the separate commit transaction that survives a
draw revert.

This ADR is **orthogonal to ADR-0012**: ADR-0012 supersedes the _snapshot /
data-availability_ layer of 0003/0008/0009; this ADR supersedes only the _VRF
delivery_ layer. The two touch different halves of ADR-0009 and compose without
conflict.

## Context

ADR-0009 describes the VRF result arriving via a **caller-supplied**
`commit_vrf(vrf_result)` instruction and, in its Consequences, states that
"closing the brute-force fully requires oracle-verified VRF — magicblock
integration, **still deferred**." The ADR-0008 addendum repeats the
`commit_vrf(vrf_result)` framing.

The code does not match either statement. It integrated authenticated VRF
(commit `a23198c` / bean `veridao-crbf`):

- `request_vrf` (`lib.rs:886`) CPIs into the MagicBlock VRF program.
- `commit_vrf_callback` (`lib.rs:941`) is the callback the oracle invokes; its
  signer is constrained to `scoped_vrf_identity(&crate::ID)` (`lib.rs:3236`) — a
  per-program identity PDA, not the deprecated global constant.

ADR-0010 already assumes the callback flow (`request_vrf → commit_vrf_callback
→ draw`), and ADR-0012 and the README describe it correctly. ADR-0009 and the
ADR-0008 addendum are the outliers, so the ADR set carries **two incompatible
VRF security stories** — an evaluator cannot tell whether authenticated VRF is
an accepted dependency or a deferred target (CONCEPT-REVIEW §Bad 16). The code
is in the better state; this ADR brings the docs to it.

## Decision

VRF randomness is delivered exclusively by an **oracle-authenticated callback**.
There is no caller-supplied commit path. Three on-chain constraints make the
delivery tamper-proof, and a one-shot guard makes it immutable once landed.

### 1. What the oracle authenticates

`commit_vrf_callback` carries `vrf_program_identity: Signer` constrained by

```rust
#[account(address = ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity(&crate::ID))]
pub vrf_program_identity: Signer<'info>,
```

(`lib.rs:3236`). The VRF request is **scoped**
(`create_request_high_priority_scoped_randomness_ix`), so the oracle fulfills by
signing with the per-program identity PDA
`scoped_vrf_identity(callback_program_id) = PDA([b"identity", accord_program_id], vrf_program)`.
The callback validates exactly that PDA, binding the randomness to the Accord
program: a fulfillment scoped for a _different_ program cannot satisfy this
constraint. Only the VRF program can sign with the identity, so the
`randomness: [u8; 32]` argument arrives as a value the oracle vouches for. A
caller cannot forge the callback and cannot substitute its own bytes.

### 2. Who may request randomness

Anyone. `request_vrf` takes a plain `caller: Signer` (`lib.rs:2032`) with no
authority check — the cranker who fires the request is irrelevant. The request
is **idempotent**: both `request_vrf` and `commit_vrf_callback` require
`committed_vrf.is_none()` (`lib.rs:796`, `lib.rs:838`), so a second request for
the same dispute is a no-op error.

### 3. The request is bound to the specific dispute

`request_vrf` builds the CPI with four pinning parameters (`lib.rs:805-816`):

| Parameter                | Value                                       | Binds                                  |
| ------------------------ | ------------------------------------------- | -------------------------------------- |
| `caller_seed`            | `dispute.key().to_bytes()`                  | the oracle request to **this dispute** |
| `callback_program_id`    | `crate::ID`                                 | the callback to the **Accord program** |
| `callback_discriminator` | `CommitVrfCallback::DISCRIMINATOR`          | the callback to **this instruction**   |
| `accounts_metas`         | `[{ pubkey: dispute_key, writable: true }]` | the write to **this dispute PDA**      |

`oracle_queue` is additionally constrained to `DEFAULT_QUEUE` (`lib.rs:2050`).
The random value the oracle produces can therefore only land on the one dispute
that requested it, via the one instruction that stores it. There is no path by
which a request for dispute A delivers randomness to dispute B.

### 4. One-shot immutability — no post-commit substitution

`dispute.committed_vrf: Option<[u8; 32]>` (`state.rs:100`) starts `None`. The
first successful callback sets it; every subsequent `request_vrf` and
`commit_vrf_callback` fails with `VrfAlreadyCommitted`. The committed value
**cannot be replaced** after it lands, so the brute-force attack ADR-0009 was
designed around (re-committing different `vrf_result` values until a favourable
panel appears) is impossible at the instruction level — not merely
economically deterred. The draw retry loop does **not** re-call the oracle: it
increments `draw_attempt`, which mixes into the seed (`lib.rs:901`), re-deriving
the per-slot values from the same immutable committed bytes.

### 5. The split-transaction rationale is retained

ADR-0009 / the ADR-0008 addendum split the commit from the draw for a sound
reason: Solana transaction atomicity would revert the VRF write on any failed
`draw`, letting a caller re-submit a different value. That property is
preserved — `commit_vrf_callback` is the standalone, always-succeeds commit
transaction; `draw` only reads `committed_vrf` and reverts the `Round` init on
collision while leaving the Dispute (and its committed VRF) intact. The
callback replaces `commit_vrf(vrf_result)`; the commit/draw separation does not
change.

### Residual liveness risk and its mitigation

The one trusted moving part is the **provider**: if the MagicBlock oracle never
responds to `request_vrf`, the dispute stalls at the `SnapshotPosted` state
with `committed_vrf = None`. This is a liveness dependency, not a correctness
one — no value can be forged, but a dispute can be held hostage by provider
non-response. It is closed by the escape path (CONCEPT-REVIEW Ugly 4; bean
`accord-18fb`): a VRF-request timeout entitles any caller to `cancel_dispute`,
moving the dispute to a terminal `Failed` state and refunding the filer. With
that path in place, the worst a non-responsive provider can do is force a
refund, not capture a ruling.

## Considered Options

- **Caller-supplied `commit_vrf(vrf_result)` (the ADR-0009 design).** Rejected.
  It leaves the brute-force window structurally open and requires the
  "oracle-verified VRF still deferred" caveat that an evaluator cannot reconcile
  with the shipped code. The authenticated callback was already built (bean
  `veridao-crbf`) precisely to close it.

- **Re-requesting the oracle on every `draw` retry.** Rejected. It re-opens the
  commit/revert problem ADR-0009 identified (a failed draw would discard the
  VRF, letting the next request pick a fresh value), and it wastes oracle calls.
  The single immutable commit + `draw_attempt` re-derivation is cheaper and
  stronger.

- **Trusting the caller's `vrf_result` but verifying it on-chain (VDF / proof
  check).** Rejected for v1. The MagicBlock program already performs the
  verification and authenticates via its program identity; duplicating the
  verification on-chain would add cost and a second trust anchor for no gain.

## Consequences

- **A single, consistent VRF story across the ADR set.** ADR-0009's caller-
  commit framing and "still deferred" caveat are superseded; ADR-0010, ADR-0012,
  and the README already describe the callback flow, so no further reconciliation
  is needed. No ADR presents a caller-supplied commit as the current design.

- **The brute-force attack is closed structurally.** Because `committed_vrf` is
  set once by an authenticated oracle and is thereafter immutable, the caller
  has no input that influences the random value — only the `draw_attempt`
  counter, which uniformly re-derives all panel slots.

- **The scoped VRF identity is an accepted dependency.** The protocol's
  randomness integrity rests on the VRF program's scoped identity PDA
  (`scoped_vrf_identity(&crate::ID)`) being the signer on the callback. The
  request is scoped, so fulfillment is signed with this per-program PDA — not
  the deprecated global `VRF_PROGRAM_IDENTITY`. The program depends on
  `ephemeral-rollups-sdk 0.16.2`, which re-exports the VRF SDK under
  `ephemeral_rollups_sdk::vrf`. This is an explicit, recorded dependency.

- **Liveness depends on the provider, bounded by the escape path.** Provider
  non-response is recoverable via `cancel_dispute` (bean `accord-18fb`), not via
  the VRF layer itself.

- **Scoped-identity correction (amendment, 2026-08-10).** The original as-built
  pinned the global `VRF_PROGRAM_IDENTITY`; that mismatches the scoped request
  the program issues, so the oracle's scoped-identity fulfillment would have
  failed the constraint in production — the callback was never exercised
  end-to-end (every test injects the VRF directly). The callback now validates
  `scoped_vrf_identity(&crate::ID)`, matching the scoped fulfillment path.

## References

- ADR-0009 — original sortition + committed-VRF design (VRF-delivery layer
  superseded here; snapshot layer superseded by ADR-0012)
- ADR-0008 — addendum (commit/draw split rationale; superseded here, rationale
  retained)
- ADR-0010 — SDK choreography (`request_vrf → commit_vrf_callback → draw`),
  already consistent
- ADR-0012 — on-chain accumulator (orthogonal; snapshot layer)
- `programs/accord/src/lib.rs:793-847`, `:2026-2067` — the as-built flow
- Bean `veridao-crbf` — shipped the authenticated callback integration
- CONCEPT-REVIEW §Bad 16 — the documentation defect this ADR resolves
