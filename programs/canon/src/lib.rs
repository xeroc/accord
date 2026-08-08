//! # Accord Canon
//!
//! Curated-list / token-registry Arbitrable that files disputes via the Accord.
//! Owns the item lifecycle + item deposits; when an item is challenged it calls
//! `create_dispute(options=[list/remove], …)` and reads `get_ruling` to flip
//! item status. Canon is an Arbitrable, NOT a Subaccord — Accord Core is
//! unchanged.

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use errors::CanonError;
pub use state::*;

use anchor_lang::prelude::*;

declare_id!("GYvMBmzi6w2PPuK8tPGnnNsVprzWeNBecete3Jp6aeKU");

// ponytail: `#[derive(Accounts)]` structs MUST live at the crate root (not in
// submodules like `instructions::`). Anchor's `#[program]` codegen emits
// `pub use crate::__client_accounts_*::*` at the crate root, and the
// `#[derive(Accounts)]` macro emits `__client_accounts_*` as a sibling of the
// struct definition — both only align when the struct is at the crate root.
// The accord crate follows the same convention (every Accounts struct in
// lib.rs). See anchor-syn-1.1.2 parser/program/mod.rs:57 (first-segment bug)
// + codegen/program/accounts.rs:28.

#[program]
pub mod canon {
    use super::*;

    /// Permissionless creation of a Canon curated list + its backing Accord
    /// Subaccord. See `instructions::create_list` for the full doc.
    #[allow(clippy::too_many_arguments)]
    pub fn create_list(
        ctx: Context<CreateList>,
        stake_mint: Pubkey,
        fee_mint: Pubkey,
        list_program: Pubkey,
        rules_hash: [u8; 32],
        submit_deposit: u64,
        challenge_pct: u16,
        listing_window: u64,
        withdrawal_timelock: u64,
    ) -> Result<()> {
        instructions::create_list::create_list_handler(
            ctx,
            stake_mint,
            fee_mint,
            list_program,
            rules_hash,
            submit_deposit,
            challenge_pct,
            listing_window,
            withdrawal_timelock,
        )
    }
}

/// Account context for `create_list` (SPEC §Instructions #1).
///
/// Inits the `CanonList` PDA `["canon", creator, rules_hash]` and CPIs Accord
/// `create_subaccord` for the 1:1 backing court with the Canon canonical
/// dispute-mechanism defaults. `risk_type := rules_hash`. The Subaccord creator
/// is the list creator (same `Signer`), so the seeds pair naturally:
///   CanonList  `["canon",     creator, rules_hash]`
///   Subaccord  `["subaccord", creator, rules_hash]`
/// and no PDA signing is needed — the creator's signer privilege propagates
/// through the CPI.
#[derive(Accounts)]
// `rules_hash` is the 4th handler arg; anchor requires listing all preceding
// args positionally (no `_` skip in this anchor version).
#[instruction(stake_mint: Pubkey, fee_mint: Pubkey, list_program: Pubkey, rules_hash: [u8; 32])]
pub struct CreateList<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The new Canon list PDA. Seeds: `["canon", creator, rules_hash]`.
    /// `rules_hash` + `list_program` are immutable post-init.
    #[account(
        init,
        payer = creator,
        space = 8 + CanonList::INIT_SPACE,
        seeds = [SEED_CANON_LIST, creator.key().as_ref(), rules_hash.as_ref()],
        bump,
    )]
    pub list: Account<'info, CanonList>,

    /// The 1:1 backing Accord Subaccord — CPI-created by Accord's
    /// `create_subaccord`. Seeds: `["subaccord", creator, risk_type]` where
    /// `risk_type = rules_hash`. `init` is owned by Accord; we declare the PDA
    /// here only so Anchor passes the right account + verifies the seeds.
    /// CHECK: created via CPI into Accord; seeds validated against Accord's ID.
    #[account(
        mut,
        seeds = [accord::constants::SEED_SUBACCORD, creator.key().as_ref(), rules_hash.as_ref()],
        seeds::program = accord::ID,
        bump,
    )]
    pub subaccord: AccountInfo<'info>,

    /// Accord program (CPI target).
    /// CHECK: constrained by `address = accord::ID`.
    #[account(address = accord::ID)]
    pub accord_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
