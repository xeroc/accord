# Accord upgrade authority — Squads multisig, then post-audit freeze

The Accord program's BPF upgrade authority is a Squads multisig for v1. Once the mechanism is sufficiently audited and battle-tested, the upgrade authority is set to `None`, freezing the program permanently. The multisig setup and its proposal timelock are operational concerns outside the Accord program itself; a circuit-breaker (`pause` / `unpause`) is included for emergency response during the multisig phase and becomes inert after the freeze.

## Considered Options

- **Immutable from launch (authority = None day one):** most trustless, but leaves no way to patch a discovered bug before the mechanism is proven.
- **Permanent multisig (never freeze):** standard, but retains indefinite upgrade risk on capital-bearing code.

## Consequences

- The freeze is gated on "sufficiently audited" — a judgment call, not an automated milestone.
- `pause` is instant (multisig-gated); `unpause` is timelocked, so a panic freeze cannot be held indefinitely without notice.

## Residual trust assumptions

Stated plainly (CONCEPT-REVIEW §Ugly 8; see the [Trust Profile](../../docs/security/trust-profile.md)):

- **Multisig members are trusted with capital-bearing code for the entire
  multisig phase.** A quorum compromise — or a routine but buggy upgrade — can
  change or brick the program before the freeze. The on-chain mechanism does not
  constrain _what_ an upgrade may do.
- **"Sufficiently audited" is a human judgment.** There is no automated trigger
  for the freeze; it is a deliberate, offline decision. The multisig phase can
  last indefinitely if no one decides to freeze.
- **Freeze is irrevocable.** Once the authority is set to `None`, a discovered
  bug cannot be patched. This is the intended trade (trustless end state vs.
  recoverability), not a defect.
- **`pause` is instant and unrestricted in scope.** The multisig can freeze all
  new `create_dispute` / `stake` / `appeal` immediately; only `unpause` is
  timelocked. A malicious multisig can halt growth at will (capital is never
  trapped — `unstake` and in-flight cranks remain live).
- **No on-chain identity is bound to the multisig.** Squads membership and key
  custody are off-chain operational concerns; the program sees only an
  authority pubkey.

Until the post-audit freeze, "no central authority" overstates the upgrade
surface: a small human-controlled quorum can replace the code.
