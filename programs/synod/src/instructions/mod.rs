#![allow(ambiguous_glob_reexports)]
//! Instruction handlers for Synod.
//!
//! Each instruction's `Accounts` struct + handler lives in its own submodule.
//! `lib.rs` dispatches one-line from the `#[program]` mod (always fully-
//! qualified: `instructions::open_case::handler`). The glob re-exports are
//! required by Anchor's `#[program]` CPI-client codegen; the `handler` names
//! collide under the glob but are never used unqualified, so the
pub mod claim;
pub mod file_dispute;
pub mod join;
pub mod open_case;
pub mod refund_roster_miss;

pub use claim::*;
pub use file_dispute::*;
pub use join::*;
pub use open_case::*;
pub use refund_roster_miss::*;
