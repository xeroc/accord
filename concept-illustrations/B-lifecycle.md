# Group B — The dispute lifecycle

Illustration targets for the Accord docs site. Each concept gets one individual, self-contained looping motion illustration (~3–8s) that makes the concept click without narration.

**What Accord is:** a Schelling-point arbitration primitive on Solana. Any program (an *Arbitrable*) files a Dispute via CPI; Accord draws stake-weighted Jurors from a live Merkle-Sum-Tree accumulator using VRF randomness, collects commit-reveal votes, and emits a Ruling. Coherent Jurors earn fees plus slashed stake; incoherent Jurors are slashed. Appeals double the panel (3→7→15→31) at exponentially rising bond cost.

---

## B1. Dispute state machine

The spine everything hangs off: `Created → Drawn → Review → Commit → Reveal → RoundResolved → Final → Closed`, with the appeal loop from `RoundResolved` back to a new draw, and the `RedrawEligible` and `Failed` branches. Illustrate as a classic node-and-edge state diagram where edge labels carry the acting party (juror, cranker, appellant) with a gear icon on permissionless crank transitions, and the time windows (review/commit/reveal per-Subaccord, appeal window default 3 days) drawn as ruler segments between states. One glance should answer "who can do what, when."

## B2. Commit-reveal (why votes are sealed)

`hash(vote, salt)` in phase one, `{vote, salt}` opened in phase two; without secrecy, jurors copy the observed majority and the Schelling point never forms independently. Illustrate as a two-panel timeline: all jurors dropping opaque sealed envelopes onto a chain strip, then opening them while the program re-hashes and matches — with a third mini-panel of a copycat juror squinting at the envelope wall and finding nothing to copy. Include the scalar variant's widened preimage `hash(vote_le8 ‖ salt ‖ juror)` as a footnote.
