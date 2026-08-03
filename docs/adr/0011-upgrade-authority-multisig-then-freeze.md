# Accord upgrade authority — Squads multisig, then post-audit freeze

The Accord program's BPF upgrade authority is a Squads multisig for v1. Once the mechanism is sufficiently audited and battle-tested, the upgrade authority is set to `None`, freezing the program permanently. The multisig setup and its proposal timelock are operational concerns outside the Accord program itself; a circuit-breaker (`pause` / `unpause`) is included for emergency response during the multisig phase and becomes inert after the freeze.

## Considered Options

- **Immutable from launch (authority = None day one):** most trustless, but leaves no way to patch a discovered bug before the mechanism is proven.
- **Permanent multisig (never freeze):** standard, but retains indefinite upgrade risk on capital-bearing code.

## Consequences

- The freeze is gated on "sufficiently audited" — a judgment call, not an automated milestone.
- `pause` is instant (multisig-gated); `unpause` is timelocked, so a panic freeze cannot be held indefinitely without notice.
