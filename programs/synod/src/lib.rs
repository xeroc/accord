pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GdV5rbRd579LUs3zB2PkbBsJNCMSj55rwWdikGuobHeC");

// Stub crate — no instructions yet. The first instruction lands TDD-first
// (LiteSVM RED→GREEN) with the Synod v1 build; `programs/synod/SPEC.md` is
// the authority on what ships.
#[program]
pub mod synod {}
