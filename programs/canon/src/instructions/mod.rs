//! Instruction handlers for Canon.
//!
//! Each instruction's `Accounts` struct + handler lives in its own submodule.
//! `lib.rs` dispatches one-line from the `#[program]` mod (always fully-
//! qualified: `instructions::submit_item::handler`). The glob re-exports are
//! required by Anchor's `#[program]` CPI-client codegen; the `handler` names
//! collide under the glob but are never used unqualified, so the
//! `ambiguous_glob_reexports` lint is silenced.

#![allow(ambiguous_glob_reexports)]

pub use advance_pending::*;
pub use challenge_item::*;
pub use settle_item::*;
pub use submit_item::*;
pub use withdrawal::*;

pub mod advance_pending;
pub mod challenge_item;
pub mod settle_item;
pub mod submit_item;
pub mod withdrawal;
