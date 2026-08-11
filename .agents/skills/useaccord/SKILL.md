---
name: useaccord
description: Work with the Accord arbitration protocol — create Subaccords, stake jurors, file disputes, draw panels, vote, appeal, and settle rulings via the `useaccord` CLI and `@useaccord/sdk`. Covers the full dispute lifecycle, the two-phase withdraw, MST accumulator proofs, and the cranker service.
when_to_use: When the user asks about Accord, disputes, jurors, staking, arbitration, Schelling point voting, attestation-gated / credential-gated juror pools, the useaccord CLI, or any instruction in the Accord program (create_subaccord, stake, prune_juror, reclaim_slot, create_dispute, draw_seat, commit, reveal, appeal, finalize, settle_round, cancel_dispute, redraw, withdraw_fees).
version: 0.1.0
---

# useaccord — Accord Arbitration Protocol

**Accord** is a Schelling-point arbitration primitive on Solana. Any program
files a Dispute; the Accord draws stake-weighted Jurors (VRF), collects
commit-reveal votes, and emits a Ruling.

## Quick routing

| Task                            | CLI command                                          | Reference                                         |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Create a Subaccord (juror pool) | `useaccord lifecycle:create-subaccord`               | [01-lifecycle.md](references/01-lifecycle.md)     |
| Stake juror capital             | `useaccord staking:stake`                            | [02-staking.md](references/02-staking.md)         |
| Evict an attestation-expired juror | `useaccord staking:prune-juror`                      | [02-staking.md](references/02-staking.md)         |
| Recycle a drained juror slot    | `useaccord staking:reclaim-slot`                     | [02-staking.md](references/02-staking.md)         |
| File a dispute                  | `useaccord dispute:create`                           | [04-dispute.md](references/04-dispute.md)         |
| Draw jurors (VRF + per-seat)    | `useaccord draw:resolve-panel` + `draw:submit-panel` | [05-vrf-draw.md](references/05-vrf-draw.md)       |
| Commit / reveal votes           | `useaccord vote:commit` + `vote:reveal`              | [06-voting.md](references/06-voting.md)           |
| Appeal a ruling                 | `useaccord appeal:open`                              | [07-appeal.md](references/07-appeal.md)           |
| Finalize / settle               | **Cranker automates** (or manual CLI)                | [08-settlement.md](references/08-settlement.md)   |
| Read account state              | `useaccord read:*`                                   | [09-reads.md](references/09-reads.md)             |
| Build MST proofs offline        | `useaccord accumulator:*`                            | [03-accumulator.md](references/03-accumulator.md) |

## Key concepts

- **Subaccord**: a specialized juror pool with its own staking token, windows,
  and slash factor. Permissionless to create.
- **Dispute lifecycle**: `Created → Drawn → Commit → Reveal → RoundResolved →
Final`. Permissionless cranks advance each state when its window elapses.
- **Two-mint economics (ADR-0020)**: `staking_token` (collateral) and
  `fee_token` (compensation) are separate. Slashing is ledger-only
  (`stake_delta`); the `stake_vault` balance is invariant.
- **MST accumulator (ADR-0012)**: a Merkle-Sum Tree maintained on every
  `stake`/`request_withdraw`/`reconcile_stake`. The root is canonical — no
  posted root, no bond, no challenge window.
- **Attestation gate (PROG-ATTESTTION)**: a Subaccord may optionally require
  jurors to hold a valid SAS attestation (`juror_credential` issuer +
  `juror_schema`). Omit both at creation ⇒ stake-only (default, unchanged). On
  a gated pool, `stake` needs the juror's `--attestation`; expired
  attestations are pruned by the permissionless `staking:prune-juror` crank.
- **Cranker service** (`apps/cranker/`, milestone `accord-27r5`): automates all
  permissionless instructions (request_vrf, draw_seat, finalize, settle,
  cancel, redraw). Reconciler loop (60s) is authoritative; WS is optimization.
- **Single-signer CLI**: `--keypair` is both fee payer and instruction signer.
  For multi-signer operations (juror vote, authority propose), use the SDK.

## Architecture

```
your program ──create_dispute()──► Accord ──draws jurors, runs commit/reveal──► Ruling
      ▲                                                                            │
      └────────────────────────────get_ruling()────────────────────────────────────┘
```

SDK: `@useaccord/sdk` (Codama codegen, ADR-0010).
Program: `cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed`.

## Install

```bash
pnpm add -g @useaccord/cli
useaccord config          # verify rpc + keypair + balance
```

Env vars: `ACCORD_RPC_URL`, `ACCORD_WS_URL`, `ACCORD_KEYPAIR_PATH`.
