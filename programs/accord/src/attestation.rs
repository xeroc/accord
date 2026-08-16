//! SAS (Solana Attestation Service) credential gating (PROG-ATTESTTION):
//! the attestation-account layout parser plus the validation shared by
//! `stake`, `draw_seat`, and `prune_juror`.

use crate::{errors::AccordError, state::Subaccord};
use anchor_lang::prelude::*;

// ===========================================================================
// SAS (Solana Attestation Service) attestation parsing (PROG-ATTESTTION)
// ===========================================================================
//
// The SAS program is a Pinocchio program deployed at
// `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`. Its `Attestation` account
// has a variable-length layout — `expiry` follows the variable `data` blob, so
// (unlike the fixed-offset `layout` reads above) `expiry` needs a dynamic
// parser. The fixed-offset fields (`credential`, `schema`, `data[0..32]`
// wallet) reuse the same named-offset idiom.

/// Dynamic-offset parser for SAS Attestation accounts. `expiry` sits *after*
/// the variable `data` blob + signer, so its byte offset depends on `data_len`
/// — it is NOT a compile-time constant and cannot be modelled by the fixed-
/// offset `layout` mod. The credential/schema/wallet reads ARE fixed-offset.
pub(crate) mod sas_layout {
    use crate::AccordError;
    use anchor_lang::prelude::*;

    /// SAS program ID (solana-attestation-service).
    pub(crate) const SAS_PROGRAM_ID: Pubkey =
        pubkey!("22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG");
    /// `AttestationDiscriminator` (program/src/state/attestation.rs in SAS).
    pub(crate) const SAS_ATTESTATION_DISCRIMINATOR: u8 = 2;

    // Fixed byte offsets within a SAS Attestation account body.
    const DISC_OFF: usize = 0; // u8
    const CREDENTIAL_OFF: usize = 33; // 32
    const SCHEMA_OFF: usize = 65; // 32
    const DATA_LEN_OFF: usize = 97; // u32 LE
    const DATA_OFF: usize = 101; // variable-length `data` starts here
    const WALLET_W: usize = 32; // subject binding = data[0..32]
    const SIGNER_W: usize = 32;
    const EXPIRY_W: usize = 8; // i64 LE; 0 ⇒ never expires

    /// Minimum account length carrying a 32-byte wallet subject + expiry.
    const MIN_LEN: usize = DATA_OFF + WALLET_W + SIGNER_W + EXPIRY_W; // 173

    /// Parsed view of a SAS Attestation — the four fields the gate checks.
    #[derive(Clone, Copy)]
    pub(crate) struct SasAttestationView {
        pub credential: Pubkey,
        pub schema: Pubkey,
        /// Subject wallet — `data[0..32]` (schema convention: first field).
        pub wallet: Pubkey,
        /// i64 expiry; `0` ⇒ never expires.
        pub expiry: i64,
    }

    impl SasAttestationView {
        /// Parse a raw SAS Attestation account body. Validates the
        /// discriminator and that the account carries a 32-byte wallet + the
        /// expiry tail. Does NOT check credential/schema/wallet equality — the
        /// caller knows the expected values and applies those checks.
        pub(crate) fn parse(data: &[u8]) -> Result<Self> {
            require!(data.len() >= MIN_LEN, AccordError::AttestationMalformed);
            require!(
                data[DISC_OFF] == SAS_ATTESTATION_DISCRIMINATOR,
                AccordError::AttestationMalformed
            );
            let data_len = u32::from_le_bytes(
                data[DATA_LEN_OFF..DATA_LEN_OFF + 4]
                    .try_into()
                    .map_err(|_| AccordError::AttestationMalformed)?,
            );
            // Subject binding requires a 32-byte wallet field at data[0..32].
            require!(
                data_len >= WALLET_W as u32,
                AccordError::AttestationMalformed
            );
            // `expiry` follows the variable data blob + signer.
            let expiry_off = DATA_OFF + data_len as usize + SIGNER_W;
            require!(
                data.len() >= expiry_off + EXPIRY_W,
                AccordError::AttestationMalformed
            );
            let credential = Pubkey::new_from_array(
                data[CREDENTIAL_OFF..CREDENTIAL_OFF + 32]
                    .try_into()
                    .map_err(|_| AccordError::AttestationMalformed)?,
            );
            let schema = Pubkey::new_from_array(
                data[SCHEMA_OFF..SCHEMA_OFF + 32]
                    .try_into()
                    .map_err(|_| AccordError::AttestationMalformed)?,
            );
            let wallet = Pubkey::new_from_array(
                data[DATA_OFF..DATA_OFF + WALLET_W]
                    .try_into()
                    .map_err(|_| AccordError::AttestationMalformed)?,
            );
            let expiry = i64::from_le_bytes(
                data[expiry_off..expiry_off + EXPIRY_W]
                    .try_into()
                    .map_err(|_| AccordError::AttestationMalformed)?,
            );
            Ok(Self {
                credential,
                schema,
                wallet,
                expiry,
            })
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// `expiry` lives at a dynamic offset (after variable `data`); the
        /// parse must locate it correctly across `data_len` values. Mirrors
        /// `tests::layout_tests::offsets_match_borsh` — this is the SAS analog.
        #[test]
        fn sas_expiry_offset_is_dynamic() {
            for &data_len in &[32u32, 48, 100, 256] {
                let mut buf = vec![0u8; DATA_OFF + data_len as usize + SIGNER_W + EXPIRY_W];
                buf[DISC_OFF] = SAS_ATTESTATION_DISCRIMINATOR;
                buf[DATA_LEN_OFF..DATA_LEN_OFF + 4].copy_from_slice(&data_len.to_le_bytes());
                let expiry_off = DATA_OFF + data_len as usize + SIGNER_W;
                let expiry = 1_700_000_000i64 + data_len as i64;
                buf[expiry_off..expiry_off + EXPIRY_W].copy_from_slice(&expiry.to_le_bytes());
                let view = SasAttestationView::parse(&buf).expect("parse");
                assert_eq!(view.expiry, expiry, "data_len={data_len}");
            }
        }

        #[test]
        fn sas_never_expires_is_zero() {
            let mut buf = vec![0u8; MIN_LEN];
            buf[DISC_OFF] = SAS_ATTESTATION_DISCRIMINATOR;
            buf[DATA_LEN_OFF..DATA_LEN_OFF + 4].copy_from_slice(&32u32.to_le_bytes());
            let view = SasAttestationView::parse(&buf).expect("parse");
            assert_eq!(view.expiry, 0);
        }

        #[test]
        fn sas_bad_discriminator_rejected() {
            let mut buf = vec![0u8; MIN_LEN];
            buf[DISC_OFF] = 9; // wrong discriminator
            buf[DATA_LEN_OFF..DATA_LEN_OFF + 4].copy_from_slice(&32u32.to_le_bytes());
            assert!(SasAttestationView::parse(&buf).is_err());
        }
    }
}

/// Validate a SAS attestation `AccountInfo` against the Subaccord's credential
/// binding and the juror's wallet. Returns the parsed `expiry` (i64; `0` ⇒
/// never expires) on success. Shared by `stake`, `draw_seat`, and `prune_juror`
/// so the offset math is unit-tested once (via `sas_layout::tests`).
pub(crate) fn validate_sas_attestation(
    info: &AccountInfo,
    expected_credential: &Pubkey,
    expected_schema: &Pubkey,
    juror: &Pubkey,
) -> Result<i64> {
    require!(
        info.owner == &sas_layout::SAS_PROGRAM_ID,
        AccordError::AttestationMalformed
    );
    let data = info.try_borrow_data()?;
    let view = sas_layout::SasAttestationView::parse(&data)?;
    require!(
        view.credential == *expected_credential,
        AccordError::AttestationMismatch
    );
    require!(
        view.schema == *expected_schema,
        AccordError::AttestationMismatch
    );
    require!(
        view.wallet == *juror,
        AccordError::AttestationSubjectMismatch
    );
    Ok(view.expiry)
}

/// Maximum dispute lifecycle `(review + commit + reveal + appeal) ×
/// (max_appeals + 1)`, in seconds. The stake-time gate requires the juror's
/// attestation to outlive this horizon so it cannot lapse mid-dispute.
pub(crate) fn attestation_horizon(sub: &Subaccord) -> Result<i64> {
    let cycle = sub
        .review_window
        .checked_add(sub.commit_window)
        .and_then(|v| v.checked_add(sub.reveal_window))
        .and_then(|v| v.checked_add(sub.appeal_window))
        .ok_or(AccordError::ArithmeticOverflow)?;
    let rounds = (sub.max_appeals as u64)
        .checked_add(1)
        .ok_or(AccordError::ArithmeticOverflow)?;
    let h = cycle
        .checked_mul(rounds)
        .ok_or(AccordError::ArithmeticOverflow)?;
    Ok(h as i64)
}
