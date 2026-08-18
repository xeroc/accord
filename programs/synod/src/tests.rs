//! Host unit tests. The LiteSVM instruction suite lives in `tests/` (gated
//! `#![cfg(feature = "no-entrypoint")]`); this file pins the manual layout
//! offsets of `SynodCase` against the Borsh wire format, mirroring the accord
//! crate's `tests::layout_tests::offsets_match_borsh` discipline.

#[cfg(test)]
mod layout_tests {
    use crate::constants::layout; // manual-offset pin — see `constants::layout`
    use crate::state::{CaseState, SynodCase};
    use anchor_lang::prelude::*;
    use anchor_lang::AccountSerialize;

    /// The manual offset consts in `layout` must land exactly on the
    /// Borsh-serialized field bytes (a fixture with distinctive values at
    /// every sliced offset). A field reorder/resize that drifts the consts
    /// fails here. Also pins the total wire size to `8 + INIT_SPACE`.
    #[test]
    fn offsets_match_borsh() {
        let sc = SynodCase {
            subaccord: Pubkey::new_from_array([0xA0; 32]),
            parties: [
                Pubkey::new_from_array([0x01; 32]),
                Pubkey::new_from_array([0x02; 32]),
                Pubkey::new_from_array([0x03; 32]),
                Pubkey::new_from_array([0x04; 32]),
                Pubkey::new_from_array([0x05; 32]),
                Pubkey::new_from_array([0x06; 32]),
                Pubkey::new_from_array([0x07; 32]),
            ],
            party_count: 0x0A,
            joined: 0x0B,
            stake: 0x0102_0304_0506_0708,
            fee: 0x090A_0B0C_0D0E_0F10,
            join_deadline: 0x1112_1314_1516_1718,
            evidence: [[0xE0; 32]; 7],
            dispute: Pubkey::new_from_array([0xB0; 32]),
            paid_out: 0x0C,
            state: CaseState::Live,
            bump: 0x0D,
        };
        let mut buf = Vec::new();
        sc.try_serialize(&mut buf).unwrap();

        // --- bitmasks + scalars the handlers/tests slice ---
        assert_eq!(buf[layout::SC_PARTY_COUNT_OFF], sc.party_count);
        assert_eq!(buf[layout::SC_JOINED_OFF], sc.joined);
        assert_eq!(
            &buf[layout::SC_STAKE_OFF..layout::SC_STAKE_OFF + 8],
            &sc.stake.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::SC_FEE_OFF..layout::SC_FEE_OFF + 8],
            &sc.fee.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::SC_DEADLINE_OFF..layout::SC_DEADLINE_OFF + 8],
            &sc.join_deadline.to_le_bytes()[..]
        );
        assert_eq!(buf[layout::SC_PAID_OUT_OFF], sc.paid_out);
        assert_eq!(buf[layout::SC_STATE_OFF], CaseState::Live as u8);

        // --- sentinel dispute PDA lands at its offset ---
        assert_eq!(
            &buf[layout::SC_DISPUTE_OFF..layout::SC_DISPUTE_OFF + 32],
            sc.dispute.as_ref()
        );

        // --- wire size: discriminator + every field, nothing hidden ---
        assert_eq!(buf.len(), 8 + SynodCase::INIT_SPACE);
    }
}
