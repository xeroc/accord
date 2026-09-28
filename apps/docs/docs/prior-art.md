# Prior Art

Fact-only comparison of Accord against the systems that share its problem
space. **There is no winners column** — the dimensions are chosen so a reader
can locate each system in the design space and draw their own conclusions.
Every cell describes documented behavior of the named system, cited to a
primary source. Facts age: this page was written **2026-09-28**; re-verify
cells against the cited sources before relying on them.

Systems compared (the ones with living, citable primary documentation):

- **[Kleros](https://docs.kleros.io/)** — crowdsourced juror court on EVM
  chains, live since 2019. Accord's acknowledged lineage.
- **[UMA](https://docs.uma.xyz/)** — optimistic oracle with escalation to a
  token-holder vote (the DVM). The other Schelling-lineage design.
- **[Kourt](https://github.com/jaekwon/kourt)** — prediction-market courts on
  gno.land; open coin-weighted electorates. Included because its design
  documentation is the most adversarially honest in the space and exercises a
  genuinely different cell of the design space (no sortition at all).

> **Aragon Court** is deliberately absent: its documentation is currently
> offline and we will not state uncited cells. It was a first-generation
> Ethereum court (drafted jurors, commit-reveal, final appeal to all
  jurors); Kleros covers that region of the space with living documentation.

## The table

| Dimension | Accord | Kleros | UMA (OOv2/v3 → DVM) | Kourt |
| --- | --- | --- | --- | --- |
| **What it is** | Arbitration oracle: any Solana program files a dispute via CPI, gets a ruling ([ADR-0004](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0004-accord-party-agnostic-permissionless-appeal.md)) | Arbitration protocol + product suite (Curate, Escrow, Proof of Humanity) ([docs](https://docs.kleros.io/)) | Optimistic oracle for data/assertions; disputes are the exception path, not the product ([docs](https://docs.uma.xyz/)) | Prediction-market courts; the permanent record of contested claims is the product ([whitepaper](https://github.com/jaekwon/kourt/blob/main/WHITEPAPER.md)) |
| **Platform** | Solana (Anchor, sBPFv3) | EVM (Ethereum, Gnosis Chain, …) | EVM | gno.land (Gno realms) |
| **Decision body** | Drawn jury: stake-weighted sortition from a per-pool accumulator | Drawn jury: PNK-stake-weighted sortition per court | All UMA token holders who vote the request (broadcast) | All court-coin holders (broadcast) |
| **Selection / randomness** | VRF committed before the draw; accumulator root frozen atomically with it; per-seat on-chain-verifiable sortition ([ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)) | Sortition over staked PNK by court ([sortition](https://docs.kleros.io/concepts/sortition)) | n/a — no selection; weight is token balance at vote | n/a — weight is coin balance, sealed at a pre-vote epoch |
| **Vote secrecy** | Commit-reveal with per-juror salt hash | Hidden votes (commit-reveal) in v2 ([docs](https://docs.kleros.io/concepts/dispute-resolution)) | DVM: committed votes, revealed at end | Open ballots; dissent is preserved on the record |
| **Who pays jurors** | The filer (per-juror fees, posted at filing) | The filer (arbitration fees) | Proposers/disputers post bonds; voters earn from rewards/slashing | Minted court emission (bounded, decaying); explicitly never counterparty money ([regulatory posture](https://github.com/jaekwon/kourt/blob/main/REGULATIONS.md)) |
| **Loser penalty** | Slash `α·min_stake` of incoherent jurors' **stake**, redistributed to coherent (stake mint) | Incoherent jurors' PNK is partially slashed and redistributed ([docs](https://docs.kleros.io/concepts/game-theory)) | Bonds forfeited on the wrong side of a resolved dispute | Forfeited bonds are **burned** — no one is paid from another's loss (whitepaper §2) |
| **Appeals / escalation** | Permissionless appeal to 2N+1 panel, rising bond + flip bounty ([ADR-0030](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0030-flip-bounty-finality-settled-appellant-reward.md)) | Anyone can fund an appeal; rounds grow ~2× ([docs](https://docs.kleros.io/concepts/dispute-resolution)) | Dispute escalates to the DVM token vote; one escalation layer | No merits appeal — verdicts are never revised; re-ask as a new claim. A Review Court hears moderation appeals only |
| **Finality** | Final ruling retro-settles every round ([ADR-0018](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0018-multi-round-settlement-against-final-ruling.md)) | Ruling executes when appeal window lapses | DVM resolution is final | Verdict recorded, never revised; the record is the product |
| **Conflict-of-interest handling** | Priced, not excluded: a drawn party-juror is slashed if incoherent (accepted residual — [trust profile](security/trust-profile.md)) | Policy-level (juror guidelines); not enforced in-protocol | n/a (no jury) | **Hard exclusion**: stakers/author/answerer cannot vote; the record survives withdrawal (whitepaper §2) |
| **Weight-freeze vs. buy-in attacks** | Accumulator root frozen at VRF commit; drawn seats locked (`active_draws`) until settlement | Stake snapshot per draw period | Token snapshot at vote | `min(sealed-epoch weight, live balance)` + coin locked until resolution ([RENTEDWEIGHT](https://github.com/jaekwon/kourt/blob/main/RENTEDWEIGHT.md)) |
| **Low turnout / no-show** | Reveal quorum (2/3) + tie ⇒ same-size redraw ladder, no-shows slashed; exhaustion ⇒ Failed with exact refunds ([ADR-0021](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0021-reveal-quorum-shortfall-redraw-draw-attempt.md), [0033](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0033-failed-path-no-participation-no-ruling-no-pay.md)) | Ruling by drawn votes cast; appeal is the corrective | No-dispute (optimistic) default; unresolved dispute escalates | Quorum floors keyed to claim size; failed rounds burn windows; unanswered claims expire with refunds |
| **Pool structure** | Permissionless Subaccords, each with own staking + fee mint ([ADR-0020](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0020-two-mint-two-vault-stake-token-fee-token.md)) | Court tree (general → specialized), stake per court | Single global DVM | One court per topic, each with its own bonding-curve coin |
| **Parameter governance** | Per-Subaccord authority, 48h timelock; program upgrade via multisig → freeze ([ADR-0005](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0005-subaccord-authority-pubkey-timelock.md), [0007](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0007-upgrade-authority-multisig-then-freeze.md)) | PNK governor + court parameter votes | UMA token governance (UMIPs) | Per-court governor over checkpointed coin votes; meta court over moderation |
| **Evidence confidentiality** | On-chain hash + trusted re-encryption operator ([ADR-0006](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0006-evidence-onchain-hash-trusted-re-encryption-operator.md), [0015](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0015-evidence-crypto-protocol-in-sdk.md)) | Public evidence standard (ERC-1497) | Public assertions + ancillary data | Public claims + public record |

## Design-space notes

- **Sortition vs. broadcast** is the load-bearing split. Accord and Kleros
  draw a small jury and pay it from filer fees; UMA and Kourt broadcast the
  question to a token-weighted electorate. Sortition makes turnout structural
  (the drawn must respond or the round redraws); broadcast must solve turnout
  (quorum floors, emission-paid voting) and weight-rental attacks (Kourt's
  `min(snapshot, live)` + vote-lock is the most documented treatment).
- **Counterparty-funded vs. minted incentives.** Accord and Kleros fund
  coherence by slashing incoherence — the incentive *is* the transfer. Kourt
  deliberately refuses that shape (minted rewards, burned bonds) to remove
  wager substance. UMA sits between (bonds at stake, token rewards for
  voting).
- **Appeal philosophy.** Accord escalates panels and retro-settles every round
  against the final ruling; Kleros escalates similarly; Kourt pins finality at
  first verdict and treats re-asking as a *feature* (claims are wordlocked, so
  re-asking produces comparable record entries). Different products: an
  escrow arbitration wants convergence, a record wants permanence.
- **Where Accord sits.** Closest to Kleros in mechanism (drawn jury,
  coherence slashing, permissionless appeal), differentiated by: live on-chain
  stake accumulator with no snapshot poster (the Kleros analog trusts a
  drawn-from stake registry at draw time), two-mint economics separating
  collateral from compensation, the no-ruling-no-pay refund contract for
  Arbitrables, and Solana-native composability (two-CPI integration).

## Sources

- Kleros: [dispute resolution](https://docs.kleros.io/concepts/dispute-resolution),
  [sortition](https://docs.kleros.io/concepts/sortition),
  [game theory](https://docs.kleros.io/concepts/game-theory),
  [yellow paper](https://kleros.io/yellowpaper.pdf) — accessed 2026-09-28.
- UMA: [docs.uma.xyz](https://docs.uma.xyz/) (OOv2, OOv3, DVM voting) —
  accessed 2026-09-28.
- Kourt: [repository](https://github.com/jaekwon/kourt) — WHITEPAPER.md,
  GAMETHEORY.md, RENTEDWEIGHT.md, REGULATIONS.md — accessed 2026-09-28.
- Accord: this repository — ADRs and SPECs as linked in the table.
