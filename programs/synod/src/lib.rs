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
pub use instructions::*;
pub use state::*;

declare_id!("GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC");

#[program]
pub mod synod {
    use super::*;

    /// Permissionless case opening (SPEC §Instructions #1): validates the
    /// roster + economics, freezes the fee, inits the `SynodCase` PDA in
    /// `Opening`. The opener does NOT stake here.
    pub fn open_case(
        ctx: Context<OpenCase>,
        parties: Vec<Pubkey>,
        stake: u64,
        join_deadline: i64,
        nonce: u64,
    ) -> Result<()> {
        instructions::open_case::handler(ctx, parties, stake, join_deadline, nonce)
    }

    /// Named-party join (SPEC §Instructions #2): locks the stake `S` into
    /// the case vault and freezes the party's evidence-hash slot.
    pub fn join(ctx: Context<Join>, evidence_hash: [u8; 32]) -> Result<()> {
        instructions::join::handler(ctx, evidence_hash)
    }

    /// Permissionless dispute filing (SPEC §Instructions #3): full roster
    /// gate, deterministic options + evidence hash, CPI Accord
    /// `create_dispute` with the case PDA as filer, bind the dispute PDA,
    /// state → Live. `nonce` is the case-open nonce (case seed component —
    /// re-derives the case PDA and provides the `invoke_signed` seeds).
    pub fn file_dispute<'a>(ctx: Context<'a, FileDispute<'a>>, nonce: u64) -> Result<()> {
        instructions::file_dispute::handler(ctx, nonce)
    }

    /// Permissionless refund crank (SPEC §Instructions #4): after the join
    /// deadline with an incomplete roster, each joined party pulls `S` back.
    /// `opener` + `nonce` re-derive the case PDA (invoke_signed seeds).
    pub fn refund_roster_miss<'a>(
        ctx: Context<'a, RefundRosterMiss<'a>>,
        nonce: u64,
    ) -> Result<()> {
        instructions::refund_roster_miss::handler(ctx, nonce)
    }

    /// Permissionless payout pull (SPEC §Instructions #5): reads the bound
    /// dispute (Final/Failed only) and pays the party identified by the
    /// destination ATA — winner pot, neutral split with remainder to last,
    /// or full `S` on Failed. `opener` + `nonce` re-derive the case PDA.
    pub fn claim<'a>(ctx: Context<'a, Claim<'a>>, nonce: u64) -> Result<()> {
        instructions::claim::handler(ctx, nonce)
    }
}
