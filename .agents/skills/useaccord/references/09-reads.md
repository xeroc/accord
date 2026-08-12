# Reads — Account Fetches + Queries

All read commands are **read-only** (no signer, no send). All support `--json`
and `--out <file>`.

## Single-account reads

```bash
useaccord read:subaccord <addr>
useaccord read:dispute <addr>
useaccord read:round <addr>
useaccord read:juror-stake <addr>
useaccord read:pause-state                    # singleton — no arg
useaccord read:pending-update <addr>
useaccord read:appeal-bond --dispute <addr> --round-idx 0
```

Each returns the decoded account (or `{ error: "not found" }`).

> **PROG-ATTESTTION:** `read:subaccord` decodes `jurorCredential` /
> `jurorSchema` and appends a `gate` line — `stake-only` when both are the
> default pubkey, else `credential-gated (credential=…, schema=…)`.

## Collection queries

```bash
# All disputes for a Subaccord
useaccord read:disputes --by-subaccord <addr>

# All disputes filed by a specific filer
useaccord read:disputes --by-filer <addr>

# All non-terminal disputes (for cranker monitoring)
useaccord read:disputes --all

# All JurorStake accounts for a Subaccord (builds the MST tree)
useaccord read:juror-stakes --by-subaccord <addr>

# All Subaccords
useaccord read:subaccords
```

## Phase helper

`disputePhase` is a dashboard helper that reads a Dispute (+ optional Round)
and returns a human-readable phase description:

```bash
useaccord read:phase --dispute <addr>
# → { phase: "reveal", description: "Reveal window open (closes in 2d 4h)",
#     nextAction: "finalize_round", nextActionDeadline: "2024-01-15T12:00:00Z" }
```

This is what the cranker's state resolver uses to determine the next action.

## SDK functions

| CLI command | SDK fn |
|---|---|
| `read:subaccord` | `fetchMaybeSubaccord` |
| `read:dispute` | `fetchMaybeDispute` |
| `read:round` | `fetchMaybeRound` |
| `read:juror-stake` | `fetchMaybeJurorStake` |
| `read:pause-state` | `fetchMaybePauseState` |
| `read:pending-update` | `fetchMaybePendingUpdate` |
| `read:appeal-bond` | `fetchMaybeAppealBond` |
| `read:disputes --by-subaccord` | `findDisputesBySubaccord` |
| `read:disputes --by-filer` | `findDisputesByFiler` |
| `read:disputes --all` | `findAllDisputes` |
| `read:juror-stakes --by-subaccord` | `findJurorStakesBySubaccord` |
| `read:subaccords` | `findAllSubaccords` |
| `read:phase` | `disputePhase` |
