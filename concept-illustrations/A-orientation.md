# Group A — Orientation: the mental model

Illustration targets for the Accord docs site. Each concept gets one individual, self-contained looping motion illustration (~3–8s) that makes the concept click without narration.

**What Accord is:** a Schelling-point arbitration primitive on Solana. Any program (an *Arbitrable*) files a Dispute via CPI; Accord draws stake-weighted Jurors from a live Merkle-Sum-Tree accumulator using VRF randomness, collects commit-reveal votes, and emits a Ruling. Coherent Jurors earn fees plus slashed stake; incoherent Jurors are slashed. Appeals double the panel (3→7→15→31) at exponentially rising bond cost.

---

## A1. System map (the cast of characters)

Before any mechanism, a reader needs the entity graph: the Accord program containing Subaccords; each Subaccord owning two vaults, an accumulator root, an evidence operator pubkey, and an authority; Jurors staking in; Arbitrables filing Disputes in; Rounds and AppealBonds hanging off Disputes. Illustrate as a single labeled container diagram — one Subaccord blown up with its internals visible, a second one collapsed to show "there are many, permissionless" — with the off-chain peers (evidence daemon, VRF oracle, cranker, credential authority) drawn outside the chain boundary with dotted connectors. This is the diagram every other one gets embedded into.

## A2. The Schelling Point = honesty

The game-theoretic core: independent jurors converge on truth without communication because coherence is the profitable strategy. Illustrate with two panels: (left) nested expectation arrows — "I vote honestly because you will, because you expect me to…" converging on a single focal answer; (right) a 2×2 payoff matrix (your vote × majority outcome) showing coherent strictly dominates, with the slash cell highlighted. Annotate the honest caveat: the equilibrium is conditional on an honest stake majority — show a whale-shaped shadow distorting the convergence when that assumption breaks.

## A3. The Arbitrable spine (two CPI calls, party-blind)

Accord knows no parties, no domain — just `create_dispute(subaccord, options, evidence_hash, fee)` in and `get_ruling() → u64` out. Illustrate as a black-box "verdict spine": four heterogeneous consumers (a registry, an escrow, an authority gate, a plain wallet) each connecting with exactly two arrows, and the payload visibly shrinking to `(options, hash, fee)` as it enters. The point to land: enforcement and consequence live in the Arbitrable; Accord only produces the answer.
