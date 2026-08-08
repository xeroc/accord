//! # Accord Canon
//!
//! Curated-list / token-registry Arbitrable that files disputes via the Accord.
//! Owns the item lifecycle + item deposits; when an item is challenged it calls
//! `create_dispute(options=[list/remove], …)` and reads `get_ruling` to flip
//! item status. Canon is an Arbitrable, NOT a Subaccord — Accord Core is
//! unchanged.
//!
//! Scaffold only — no instructions yet. State + PDAs land with the state bean.

use anchor_lang::prelude::*;

declare_id!("GYvMBmzi6w2PPuK8tPGnnNsVprzWeNBecete3Jp6aeKU");

#[program]
pub mod canon {}
