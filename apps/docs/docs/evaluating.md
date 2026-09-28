# Evaluating Accord

You were pointed at this repository and asked to judge whether it is well
thought out, consistent, and works as expected. This page is the evidence
map: what to read for your kind of review, and every headline claim pinned to
the design doc, the code, and the test that proves it. Nothing here asks you
to take our word for anything — every row names a file you can open and a
command you can run.

Start with the honest framing: the [Trust Profile](security/trust-profile.md)
states every residual assumption (trusted roles, the honest-majority-stake
precondition, the security-value ceiling) **before** any capability claim. A
project that documents its own ceilings first is the kind worth evaluating.

## Reading paths by role

### Protocol designer / mechanism nerd

1. [Trust Profile](security/trust-profile.md) — what Accord admits it is
   (arbitration oracle, not a self-enforcing court) and every trusted role
2. [Threat Model](security/threat-model.md) — the attack ledger and the
   invariants a reviewer should try to falsify
3. [Prior Art](prior-art.md) — where Accord sits against Kleros, UMA, Kourt
4. ADRs (the *why* of every locked decision, newest wins):
   [Accord index](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/index.md)
   · [Canon](https://github.com/xeroc/accord/blob/main/apps/docs/adr/canon/index.md)
   · [Synod](https://github.com/xeroc/accord/blob/main/apps/docs/adr/synod/index.md) —
   note the supersession chains (e.g. 0003/0008/0009 → 0012): rejected designs
   stay readable, with reasons
5. [`PROJECT.md`](https://github.com/xeroc/accord/blob/main/PROJECT.md) and
   [`CONTEXT.md`](https://github.com/xeroc/accord/blob/main/CONTEXT.md) —
   rationale and the ubiquitous language

### Security researcher

1. [Threat Model](security/threat-model.md) — start at the invariants table;
   each row names its enforcing code and proving test
2. [`programs/accord/security-checklist.md`](https://github.com/xeroc/accord/blob/main/programs/accord/security-checklist.md)
   — the audit authority; findings cite `file:line`, open findings are listed
   as open
3. [`reports/`](https://github.com/xeroc/accord/tree/main/reports) — completed
   security review reports (accord, canon). Internal reviews, honestly labeled
4. [Stake Accumulator](security/fraud-proofs.md) + [Sortition & VRF](security/sortition-vrf.md)
   — the draw trust chain end to end
5. [`programs/accord/SPEC.md`](https://github.com/xeroc/accord/blob/main/programs/accord/SPEC.md)
   — the as-built instruction tables, account model, and failure modes

### Integrator

1. [Quickstart](quickstart.md) → [The Arbitrable Interface](integration/arbitrable-interface.md)
   — two CPI calls; that's the whole contract
2. [SDK](sdk.md) and [`@useaccord/sdk` sources](https://github.com/xeroc/accord/tree/main/packages/sdk)
3. [Subaccords](integration/subaccords.md) — how to pick or create a pool;
   the trust-profile fields to read before filing (stake concentration,
   security-value ceiling)
4. Reference Arbitrables, both fully built and e2e-green:
   [Canon](https://github.com/xeroc/accord/blob/main/programs/canon/SPEC.md)
   (curated lists) and [Synod](https://github.com/xeroc/accord/blob/main/programs/synod/SPEC.md)
   (N-party escrow)

## Claims → evidence

| Claim | Design rationale | Code | Proof |
| --- | --- | --- | --- |
| The draw is manipulation-resistant (no fake roots, no range inflation) | [ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) | `instructions/`, MST in `utils.rs` | `accumulator.spec.ts`, `draw.spec.ts`, `accumulator_litesvm.rs`, host MST tests |
| Juror selection is verifiable on-chain, given the VRF | [Sortition & VRF](security/sortition-vrf.md) | `draw_seat` | `draw.spec.ts`, `src/tests.rs` |
| Custody is fail-closed exact (no half-moves, no drained vaults) | [ADR-0020](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0020-two-mint-two-vault-stake-token-fee-token.md), review finding SR3-M-2 | `appeal`, settlement paths | `appeal.spec.ts`, `staking.spec.ts`, `full-lifecycle.spec.ts` |
| A tie never crowns an arbitrary option | [ADR-0026](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0026-plurality-tie-non-decisive-redraw.md) | `finalize_round` | `quorum-redraw.spec.ts` |
| Low turnout cannot produce a wrong ruling — silence refunds | [ADR-0021](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0021-reveal-quorum-shortfall-redraw-draw-attempt.md), [0014](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0014-failed-state-cancel-dispute-escape-hatch.md), [0033](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0033-failed-path-no-participation-no-ruling-no-pay.md) | `finalize_round`, `redraw`, `cancel_dispute` | `quorum-redraw.spec.ts`, `dispute.spec.ts` |
| Slashing never touches the stake vault (ledger-only) | [ADR-0020](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0020-two-mint-two-vault-stake-token-fee-token.md) | `settle_round` | `staking.spec.ts`, `full-lifecycle.spec.ts` |
| Juror pay aligns with the final ruling only (multi-round included) | [ADR-0029](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0029-finality-conditional-juror-fees-same-mint-slash-dominance.md), [0018](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0018-multi-round-settlement-against-final-ruling.md) | `settle_round`, `finalize_dispute` | `appeal.spec.ts`, `scalar.spec.ts` |
| Pause/governance can never move vault funds | [ADR-0016](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0016-pause-scope-split-contains-new-exposure-never-adjudication.md), [0007](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0007-upgrade-authority-multisig-then-freeze.md) | `pause`/`unpause`/update paths | `lifecycle.pause.timelock.spec.ts`, `pause_litesvm.rs` |
| A failed dispute refunds exactly what was booked at filing | [ADR-0033](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0033-failed-path-no-participation-no-ruling-no-pay.md) | `cancel_dispute`, `claim_appeal_refund` | `dispute.spec.ts`, `synod.full-lifecycle.spec.ts` |
| The SDK contract matches the programs (no signature drift) | [ADR-0010](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0010-sdk-codama-solana-kit-facade.md) | `make codegen && pnpm -r run build` | CI (`tests` workflow) — workspace-wide type-check on every PR |
| Economic invariants are formally modeled | [`accord.qedspec`](https://github.com/xeroc/accord/blob/main/programs/accord/accord.qedspec), [synod.qedspec](https://github.com/xeroc/accord/blob/main/programs/synod/synod.qedspec) | `formal_verification/` (generated — Lean/QEDGen output, never hand-edited) | regenerated from the qedspec; see the [coverage matrix](reference/coverage.md) |

## Verify it yourself

```bash
make prep        # pins Solana 3.1.10 + Anchor 1.2.0 (avm), installs deps
make test        # FULL suite: Rust unit + LiteSVM + jest e2e on Surfpool — one command
make test_unit   # fast lane: LiteSVM + host unit tests, no validator
make coverage    # regenerate the instruction × suite matrix from source
```

`make test` auto-starts a fresh Surfpool Surfnet, deploys the built `.so`,
runs every e2e spec against it, and tears it down. The suite is green or the
milestone is not done — that rule is enforced in process (beans, TDD-only)
and in CI. The [Test Coverage matrix](reference/coverage.md) is **generated
from the source** by `make coverage`, so it cannot claim a test that does not
reference the instruction.

The two-harness philosophy: LiteSVM proves each instruction's unit contract
(happy path, authority, reinit, timelock, arithmetic, closure) in-process;
the jest/Surfpool suite proves the SDK↔program↔validator integration, CPI
chains, and token flows. Details: [README § Testing](https://github.com/xeroc/accord/blob/main/README.md#testing).

## Known residuals (we state them, you weigh them)

- **Honest-majority-stake** is the load-bearing assumption for every
  Schelling claim ([trust profile #6](security/trust-profile.md)). Capture is
  priced and bounded, not made impossible.
- **External audit has not happened.** Internal reviews live in
  [`reports/`](https://github.com/xeroc/accord/tree/main/reports); the
  security checklists carry their open findings. Pre-mainnet software.
- Trusted roles that remain: VRF provider (availability), evidence operator
  (confidentiality), indexer (liveness), upgrade multisig (until the
  post-audit freeze). Each is a row in the
  [trust profile](security/trust-profile.md) with its failure mode and
  mitigation — including which ones are v2 destinations (SNARK-proven root,
  threshold evidence crypto).
- Accepted-by-design items (party-juror overlap, key-pseudonymous admission,
  veto-by-abstention being possible but priced-and-bounded) are argued in the
  [threat model](security/threat-model.md) rather than omitted.

If your review finds a claim above with no working proof, or an attack with
no row in the threat model, that is a bug in this page — and we want to hear
about it.
