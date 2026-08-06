# Pause scope — split: pause contains new exposure, never adjudication

## Status

**Accepted.** Amends the pause scope established in ADR-0007. Resolves
CONCEPT-REVIEW §Ugly 2 (pause must not consume appeal deadlines).

## Context

ADR-0007 introduced a circuit breaker: `pause` (instant, authority-gated) and
`unpause` (timelocked). The original implementation gated three instructions
with `require!(!pause_state.paused, ProgramPaused)`:

- `create_dispute` — file a new dispute
- `stake` — add juror capital
- `appeal` — escalate a resolved round

`unstake` and `finalize_dispute` were already never pausable (capital is not
trapped; an in-flight dispute must be able to resolve).

CONCEPT-REVIEW §Ugly 2 identified a conceptual blocker: because `appeal` was
pausable while `finalize_dispute` was not, a Squads multisig (or an attacker
who compromises the threshold) could wait for a round to resolve, pause during
the appeal window, block every appeal, let the window expire, then finalize.
The pause authority could thereby **determine which provisional rulings become
final** by suppressing the procedural right to appeal. An operational safety
switch became an adjudicative lever.

## Decision

**Split-scope pause.** Pause means purely "stop NEW exposure," never an
adjudicative lever. Concretely:

- **Pausable (new exposure):** `create_dispute`, `stake`.
- **Never pausable (adjudication + capital release):** `appeal`,
  `finalize_dispute`, `finalize_round`, `commit`, `reveal`, `draw`,
  `unstake`, `claim_appeal_refund`.

The `require!(!pause_state.paused, ProgramPaused)` was removed from `appeal`.
It remains on `create_dispute` and `stake` only.

Principle: **pausing infrastructure must not select an adjudicative outcome.**
Any instruction that advances, escalates, or resolves a dispute — or releases
trapped capital — is out of pause's scope. Pause may only prevent the creation
of new disputes and the admission of new capital.

## Considered Options

- **Keep pausing appeals, but freeze the appeal clock during pause AND block
  `finalize_dispute` while paused.** Rejected — more state (a frozen-clock
  accumulator on `Dispute`/`Round`), more failure modes, and a pause-blockable
  `finalize_dispute` is itself an adjudicative lever (the pause authority could
  indefinitely delay finality). The split is cleaner and matches the "contain
  new exposure" intent of ADR-0007.
- **A separate "adjudication halt" flag distinct from the intake pause.**
  Rejected — YAGNI; there is no legitimate use case for halting adjudication
  that is not already an attack. The single `paused` bit gates only new
  exposure.

## Consequences

- The CONCEPT-REVIEW pause-authority-censors-appeal scenario is no longer
  reachable: an in-flight dispute can always be appealed and finalized
  regardless of pause state.
- `unstake`'s existing "never paused" status (ADR-0007 — pause traps no
  capital) becomes the rule for the whole adjudication path, not an exception.
- The `pause_state` account remains in the `Appeal` accounts struct for
  IDL/SDK stability but is no longer consulted; it is a candidate for removal
  in a coordinated IDL revision.
- Pause is now strictly a rate-limiter / emergency stop on **intake** (new
  disputes, new stake) — the honest framing for integrators and auditors.

## References

- Amends ADR-0007 (pause scope).
- CONCEPT-REVIEW §Ugly 2.
- Bean `accord-hh61`; original pause bean `veridao-63v3`.
