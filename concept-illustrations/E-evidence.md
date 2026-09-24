# Group E — Evidence

Illustration targets for the Accord docs site. Each concept gets one individual, self-contained looping motion illustration (~3–8s) that makes the concept click without narration.

**What Accord is:** a Schelling-point arbitration primitive on Solana. Any program (an *Arbitrable*) files a Dispute via CPI; Accord draws stake-weighted Jurors from a live Merkle-Sum-Tree accumulator using VRF randomness, collects commit-reveal votes, and emits a Ruling. Coherent Jurors earn fees plus slashed stake; incoherent Jurors are slashed. Appeals double the panel (3→7→15→31) at exponentially rising bond cost.

---

## E1. The evidence pipeline (hash on-chain, bytes re-encrypted to the drawn)

The chain stores 32 bytes per round; the filer encrypts a `manifest.yaml` package to the operator, the operator decrypts and re-encrypts to each **drawn** juror's pubkey read from `Round.jurors[]`, the juror verifies `sha256` against the chain. Illustrate as an end-to-end data flow with lock/key icons derived from on-chain identities, the manifest shown as a root over per-file `sha256` leaves (its Merkle-root nature), and a chain strip at the bottom holding only the hash. The one trust blob to mark honestly: the operator sees plaintext.

## E2. Per-round evidence hashes (counter-evidence arrives by appeal)

`evidence_hashes[0..=3]`, zero-sentinel = "inherit prior rounds," round-N jurors receive the accumulated non-zero set. Illustrate as a film-strip of four frames along the appeal ladder: filing writes frame 0, each appeal either writes a new frame or leaves a translucent "inherit" sentinel, and each panel's dossier visibly stacks all frames up to its round. This explains how a party-agnostic system gets adversarial evidence without a party model.
