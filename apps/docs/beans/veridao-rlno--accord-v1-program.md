---
# veridao-rlno
title: Accord v1 Program
status: completed
type: milestone
priority: critical
created_at: 2026-08-03T23:08:52Z
updated_at: 2026-08-04T06:44:46Z
---

Implement the VeriDAO Accord — a general-purpose, Schelling-point arbitration primitive on Solana (Anchor). Party-agnostic: any program (the Arbitrable) files a Dispute via CPI; the Accord draws stake-weighted Jurors, collects commit-reveal votes, and writes a Ruling the filer reads lazily.

## Authority (read first)

- Build spec: `programs/accord/SPEC.md` (account model, instructions, state machine, economics)
- Rationale: `docs/adr/0003`-`0007` (+ `0001`, `0002`)
- Domain language: `CONTEXT.md`
- Prior art: `context/kleros-whitepaper.md` (mechanism + economics inherited; EVM tech does NOT transfer)

## Risk Level: Critical

Vaults holding staked USDC, multi-CPI (Switchboard VRF, Arbitrable), admin keys (Subaccord authority, upgrade authority), large TVL potential. Apply the safe-solana-builder security checklist; flag every admin key, upgrade authority, and irreversible state transition in a High-Risk Decisions section.

## Design decisions (locked — see ADRs)

- Draw: Merkle-snapshot + off-chain sortition, distinct Jurors, Switchboard VRF, 1-day fraud-proof (ADR-0003)
- Party-agnostic Arbitrable + permissionless appeal (ADR-0004)
- Subaccord authority via `Pubkey::default` + on-chain 48h timelock (ADR-0005)
- Evidence: on-chain hash only + trusted re-encryption operator (ADR-0006)
- Upgrade: Squads multisig -> post-audit freeze (ADR-0007)
- Economics: flat `alpha * min_stake` slash, equal coherent split (Kleros-inherited, weight=1)

## Open decision (resolve at Epic 1 start)

Testing harness: LiteSVM (fast Rust unit/TDD, safe-solana-builder recommendation) vs jest/Surfpool (existing integration suite). Likely both — LiteSVM per-instruction unit tests, jest/Surfpool e2e. Run safe-solana-builder Step 1b to confirm.

## Epic breakdown (dependency-ordered)

1. Foundation & Capital
2. Dispute Intake & Snapshot Trust
3. Draw
4. Voting & Ruling
5. Appeals
6. Hardening & Formal Spec

## Process rules

- TDD only (RED->GREEN->REFACTOR) per instruction.
- Program changes => create/update `programs/accord/accord.qedspec` + regenerate formal_verification (AGENTS.md Beans).
- Status flows up: epic done when all tasks done; milestone when all epics done.
