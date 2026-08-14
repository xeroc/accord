//! PDA derivation helpers — the cross-program wire contract.
//!
//! Arbitrables CPI-ing Accord (e.g. Canon's `challenge_item`) must derive the
//! same PDAs Anchor's `seeds` constraints produce. These helpers are the single
//! Rust source; the SDK mirrors them in `packages/sdk/src/pda.ts`. Only the
//! helpers with off-chain/CPI consumers live here — `Round`/`JurorStake`/
//! `AppealBond` PDAs are always validated by Accord's own account constraints
//! and have no external derivation need.

use crate::constants::{SEED_ACCORD_STATE, SEED_DISPUTE, SEED_SUBACCORD};
use anchor_lang::prelude::*;

/// The Dispute account: `["dispute", filer, nonce_le]`.
pub fn dispute_pda(filer: &Pubkey, nonce: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[SEED_DISPUTE, filer.as_ref(), &nonce.to_le_bytes()],
        &crate::ID,
    )
}

/// The Subaccord account: `["subaccord", creator, risk_type]`.
pub fn subaccord_pda(creator: &Pubkey, risk_type: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED_SUBACCORD, creator.as_ref(), risk_type], &crate::ID)
}

/// The `AccordState` singleton (ADR-0007 circuit breaker): `["state"]`.
pub fn accord_state_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED_ACCORD_STATE], &crate::ID)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The seed bytes are a cross-program wire contract — Arbitrables and the
    /// SDK derive PDAs from them. Renaming a constant is free; changing its
    /// value orphans every derived account. Pinned here on purpose.
    #[test]
    fn seed_bytes_are_pinned() {
        assert_eq!(SEED_SUBACCORD, b"subaccord");
        assert_eq!(SEED_DISPUTE, b"dispute");
        assert_eq!(SEED_ACCORD_STATE, b"state");
    }
    /// Determinism + nonce sensitivity: distinct nonces must map to distinct
    /// disputes for the same filer (Canon's per-list `dispute_count` nonce).
    #[test]
    fn dispute_pda_is_deterministic_and_nonce_sensitive() {
        let filer = Pubkey::new_unique();
        let (a, _bump) = dispute_pda(&filer, 0);
        assert_eq!(dispute_pda(&filer, 0).0, a);
        assert_ne!(dispute_pda(&filer, 1).0, a);
    }
}
