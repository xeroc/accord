//! # VeriDAO Mutual
//!
//! Factory of single-purpose, sovereign **discretionary mutuals** on Solana.
//! Each Mutual covers exactly one risk type (car accidents, dental, legal
//! defense). It is a CLIENT of the Accord: when an Insured files a Claim, the
//! Mutual files a Dispute with the Accord via the Arbitrable CPI interface and
//! pays or denies based on the Ruling.
//!
//! "Cover, not insurance." No binding indemnity contract; payouts are at the
//! pool's discretion (the Accord can deny). NOT licensed insurance.
//!
//! ## Program surface (v1 target)
//!
//! - `create_mutual` — factory: risk type + evidence spec (immutable),
//!   premium/coverage terms, subaccord designation, capital config
//! - `stake` / `request_withdraw` — Staker capital into the Reserve Fund
//! - `pay_premium` — recurring Premium into the Premium Fund (rail TBD, BEAN-5)
//! - `file_claim` — Insured claim → Accord Dispute via CPI
//! - `settle_claim` — read Accord Ruling; pay (Premium Fund → Reserve) or deny
//! - `settle_period` — permissionless crank: surplus split, staker yield,
//!   withdrawals, coverage reconciliation, Premium Fund reset
//!
//! ## Capital model
//!
//! Two-tier: Premium Fund (first-loss, resets each Settlement) over Reserve
//! Fund (Staker backstop; drawing it slashes all Staker Positions pro-rata).
//! MCR gate blocks new Policies when Reserve < total_active_coverage × mcr.
//!
//! ## Spec authority
//!
//! - `MUTUAL.md` (rationale), `CONTEXT.md` (domain language), `CONTEXT-MAP.md`
//! - `docs/adr/0003` consumed premium, `docs/adr/0004` single-purpose mutuals,
//!   `docs/adr/0006` premium-payment lazy reads (deferred rail)
//!
//! Build order: this program ships SECOND, after the Accord is live. It enables
//! the accord CPI import (commented out above) once the Accord IDL is generated.

use anchor_lang::prelude::*;

// TODO: `anchor build` provisions a real keypair in target/deploy/mutual.json
// and writes the id here. Placeholder until first build.
declare_id!("11111111111111111111111111111111");

#[program]
pub mod mutual {
    use super::*;

    // Instructions land feature-by-feature (TDD). See module docs above and
    // AGENTS.md § Mutual for the v1 instruction set.
}
