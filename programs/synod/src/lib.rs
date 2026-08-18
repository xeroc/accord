pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use errors::*;
pub use state::*;

// ponytail: placeholder keypair from `anchor new` — generate + commit the
// canonical keypair before first build (same drill as canon/inveigo).
declare_id!("5o5VDoAZJFTJaBKJjhPMLMMPa8nmqgZdSkUFubNdAxZx");

// Stub crate — no instructions yet. The first instruction lands TDD-first
// (LiteSVM RED→GREEN) with the Synod v1 build; `programs/synod/SPEC.md` is
// the authority on what ships.
#[program]
pub mod synod {}
