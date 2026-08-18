//! # Accord Synod
//!
//! N-party dispute-escrow Arbitrable that files ONE single-filer Accord
//! dispute per case. Owns the party roster + escrow pot; Accord owns the
//! draw, voting, and the ruling. Synod is an Arbitrable, NOT a Subaccord —
//! Accord Core is unchanged.
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

#[cfg(test)]
mod tests;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::SynodError;
pub use state::*;
// `pub use instructions::*;` returns with the first instruction (canon shape).

declare_id!("GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC");

// Stub crate — no instructions yet. The first instruction lands TDD-first
// (LiteSVM RED→GREEN) with the Synod v1 build; `programs/synod/SPEC.md` is
// the authority on what ships.
#[program]
pub mod synod {}
