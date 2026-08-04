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
//! - `PROJECT.md` (rationale), `CONTEXT.md` (domain language), `programs/accord/SPEC.md` (build spec)
//! - `docs/adr/0001` Schelling, `0002` per-Subaccord staking token, `0003` draw,
//!   `0004` party-agnostic, `0005` Subaccord authority, `0006` evidence, `0007` upgrade
//!
//! Build order: this program ships FIRST. Client programs (the Arbitrable)
//! integrate via the Arbitrable CPI.

use anchor_lang::prelude::*;

// Program id for the Accord. (`anchor build` normally provisions this; it is
// blocked by the platform-tools/edition2024 toolchain issue — see AGENTS.md —
// so the keypair was generated with `solana-keygen` into target/deploy/.)
declare_id!("5DjgEFpkzXk37uENkfGptfARTEmr4aUoZXcSAXMYKzLZ");

#[program]
pub mod accord {
    use super::*;

    /// Liveness probe and LiteSVM harness anchor (veridao-8ys4).
    ///
    /// No state, no accounts — returns `Ok(())` and emits a version event.
    /// Arbitrables / ops may call it to confirm the program is reachable. It
    /// exists so the testing harness has a trivial instruction to round-trip;
    /// every subsequent instruction ships with its own LiteSVM `#[test]`.
    pub fn health(_ctx: Context<Health>) -> Result<()> {
        emit!(HealthChecked { version: 1 });
        Ok(())
    }
}

/// Account context for `health` — the caller signs (liveness probe), no state.
#[derive(Accounts)]
pub struct Health<'info> {
    pub caller: Signer<'info>,
}

/// Emitted by `health`. Carries the program version byte.
#[event]
pub struct HealthChecked {
    pub version: u8,
}
