//! # VeriDAO Accord
//!
//! General-purpose, Schelling-point-based decentralized arbitration accord on
//! Solana. Standalone primitive — the "Kleros of Solana." Any program can file
//! a Dispute; the Accord draws stake-weighted Jurors (Switchboard VRF), collects
//! commit-reveal votes, and emits Rulings governed by coherence incentives.
//!
//! ## Program surface (v1 target)
//!
//! - `create_subaccord` — permissionless specialized juror pool (staking token,
//!   min stake, review/commit/reveal windows, alpha slash factor)
//! - `stake` / `unstake` — juror capital into a Subaccord (USDC in v1)
//! - `create_dispute` — the **Arbitrable** CPI entry: subaccord, options,
//!   evidence hash, fee → dispute id
//! - `draw` — random stake-weighted juror selection (Switchboard VRF)
//! - `commit` / `reveal` — `hash(vote, salt)` then `{vote, salt}`
//! - `appeal` — escalate to 2N+1 jurors; losing party posts an appeal bond
//! - `execute_ruling` — write the winning option; lazy-read by the filer
//!
//! ## Spec authority
//!
//! - `PROJECT.md` (rationale), `CONTEXT.md` (domain language), `CONTEXT-MAP.md`
//! - `docs/adr/0001` two-program split, `docs/adr/0002` Schelling accord,
//!   `docs/adr/0005` USDC stake (no accord token in v1)
//!
//! Build order: this program ships FIRST. Mutual (program A) is its client.

use anchor_lang::prelude::*;

// TODO: `anchor build` provisions a real keypair in target/deploy/accord.json
// and writes the id here. Placeholder until first build.
declare_id!("11111111111111111111111111111111");

#[program]
pub mod accord {
    use super::*;

    // Instructions land feature-by-feature (TDD). See module docs above and
    // AGENTS.md § Accord for the v1 instruction set.
}
