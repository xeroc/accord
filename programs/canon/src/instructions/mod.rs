//! Instruction handlers for Canon.
//!
//! Each instruction's `Accounts` struct + handler lives in its own submodule.
//! `lib.rs` dispatches one-line from the `#[program]` mod.

pub mod submit_item;
pub use submit_item::*;
