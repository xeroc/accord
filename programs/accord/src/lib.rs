//! # Accord
//!
//! General-purpose, Schelling-point-based decentralized arbitration accord on
//! Solana. Standalone primitive — the "Kleros of Solana." Any program can file
//! a Dispute; the Accord draws stake-weighted Jurors (VRF), collects
//! commit-reveal votes, and emits Rulings governed by coherence incentives.
//!
//! ## Program surface (v1 target)
//!
//! - `create_subaccord` — permissionless specialized juror pool (staking token,
//!   min stake, review/commit/reveal windows, alpha slash factor)
//! - `stake` / `unstake` — juror capital into a Subaccord (USDC in v1)
//! - `create_dispute` — the **Arbitrable** CPI entry: subaccord, options,
//!   evidence hash, fee → dispute id
//! - `draw` — random stake-weighted juror selection (VRF)
//! - `commit` / `reveal` — `hash(vote, salt)` then `{vote, salt}`
//! - `appeal` — escalate to 2N+1 jurors; losing party posts an appeal bond
//! - `execute_ruling` — write the winning option; lazy-read by the filer
//!
//! ## Spec authority
//!
//! - `PROJECT.md` (rationale), `CONTEXT.md` (domain language), `programs/accord/SPEC.md` (build spec)
//! - `docs/adr/0001` Schelling, `0002` per-Subaccord staking token, `0003` draw,
//!   `0004` party-agnostic, `0005` Subaccord authority, `0006` evidence, `0007` upgrade
//!
//! Build order: this program ships FIRST. Client programs (the Arbitrable)
//! integrate via the Arbitrable CPI.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::anchor::vrf;
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_high_priority_scoped_randomness_ix, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;

pub use constants::*;
pub use errors::AccordError;
pub use events::*;
pub use state::*;

// Program id for the Accord. (`anchor build` normally provisions this; it is
// blocked by the platform-tools/edition2024 toolchain issue — see AGENTS.md —
// so the keypair was generated with `solana-keygen` into target/deploy/.)
declare_id!("cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed");

// ===========================================================================
// Manual byte-offset reads/writes into `remaining_accounts` `AccountInfo`s.
// ===========================================================================
//
// Accounts passed via `remaining_accounts` are raw `AccountInfo`s — they are NOT
// declared in `#[derive(Accounts)]`, so Anchor neither auto-deserializes them
// on entry nor auto-serializes them on exit. Every field read or mutation is
// therefore a manual slice into the raw account data.
//
// We write ONLY the changed field(s) — never a full `Account::try_serialize`
// re-encode — as a **compute-budget optimization** in the hot paths: `draw_seat`
// (once per seat, up to 31 per round), `cancel_dispute`, and settlement. A full
// re-serialize costs CU proportional to the whole account; a targeted field
// write costs CU proportional to the field width. The trade is layout-coupling:
// these offsets must track the Borsh field order/widths.
//
// Compile-time pinning is deliberately limited. A true field-POSITION `const`
// assert is **impossible** for Borsh-serialized Anchor accounts:
//   - `core::mem::offset_of!` reflects in-memory layout (the compiler may even
//     reorder non-`repr(C)` fields, and inserts alignment padding) — NOT the
//     packed Borsh wire format these offsets slice.
//   - `BorshSerialize`/per-field layout is not `const fn`, so the layout cannot
//     be discovered in a `const` context.
// What we do instead: (a) derive every offset from named field-width consts so
// the arithmetic is self-evident, and (b) compile-time-assert the highest sliced
// field still fits inside the account (`<= 8 + INIT_SPACE`, which IS derived
// from the real struct — catches a struct shrink at compile time). The
// authoritative tie of these offsets to the actual structs is the run-time test
// `layout_tests::offsets_match_borsh` (serialize a fixture → check the bytes):
// a field reorder/resize that drifts these consts fails `cargo test`.
pub(crate) mod layout {
    use crate::state::{AppealBond, JurorStake};
    use anchor_lang::Space;

    const DISC: usize = 8;
    const PUBKEY: usize = 32;

    // --- JurorStake (state.rs) ---
    // disc | subaccord | juror | staked | active_draws | bump | tree_index | stake_delta | slash_reserve | withdraw_requested_at | pending_withdrawal | fees_earned
    const JS_STAKED_W: usize = 8;
    const JS_ACTIVE_DRAWS_W: usize = 4;
    const JS_BUMP_W: usize = 1;
    const JS_TREE_INDEX_W: usize = 4;
    const JS_STAKE_DELTA_W: usize = 8;
    const JS_SLASH_RESERVE_W: usize = 8;
    const JS_WITHDRAW_REQUESTED_AT_W: usize = 8;
    const JS_PENDING_WITHDRAWAL_W: usize = 8;
    const JS_FEES_EARNED_W: usize = 8;

    pub(crate) const JS_STAKED_OFF: usize = DISC + PUBKEY + PUBKEY;
    pub(crate) const JS_ACTIVE_DRAWS_OFF: usize = JS_STAKED_OFF + JS_STAKED_W;
    pub(crate) const JS_STAKE_DELTA_OFF: usize =
        JS_ACTIVE_DRAWS_OFF + JS_ACTIVE_DRAWS_W + JS_BUMP_W + JS_TREE_INDEX_W;
    pub(crate) const JS_SLASH_RESERVE_OFF: usize = JS_STAKE_DELTA_OFF + JS_STAKE_DELTA_W;
    pub(crate) const JS_FEES_EARNED_OFF: usize = JS_SLASH_RESERVE_OFF
        + JS_SLASH_RESERVE_W
        + JS_WITHDRAW_REQUESTED_AT_W
        + JS_PENDING_WITHDRAWAL_W;

    // --- AppealBond (state.rs) ---
    // disc | dispute | round_idx | appellant | amount | prior_result | bump
    const AB_ROUND_IDX_W: usize = 4;
    const AB_AMOUNT_W: usize = 8;
    const AB_PRIOR_W: usize = 1;

    pub(crate) const AB_ROUND_IDX_OFF: usize = DISC + PUBKEY;
    pub(crate) const AB_AMOUNT_OFF: usize = AB_ROUND_IDX_OFF + AB_ROUND_IDX_W + PUBKEY;
    pub(crate) const AB_PRIOR_OFF: usize = AB_AMOUNT_OFF + AB_AMOUNT_W;

    // Compile-time bounds check (strongest const check available for Borsh
    // offsets): the highest sliced field must fit inside a serialized account.
    // Catches a struct shrink; does NOT catch a wrong field — that's
    // `layout_tests::offsets_match_borsh`.
    const _: () = assert!(JS_FEES_EARNED_OFF + JS_FEES_EARNED_W <= DISC + JurorStake::INIT_SPACE);
    const _: () = assert!(AB_PRIOR_OFF + AB_PRIOR_W <= DISC + AppealBond::INIT_SPACE);
}
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
        /// `layout_tests::offsets_match_borsh` — this is the SAS analog.
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
fn validate_sas_attestation(
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
fn attestation_horizon(sub: &Subaccord) -> Result<i64> {
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

#[cfg(test)]
mod layout_tests {
    use super::*; // JurorStake, AppealBond, Pubkey, layout (crate-root items)
    use anchor_lang::AccountSerialize;

    /// The manual offset consts in `layout` must land exactly on the
    /// Borsh-serialized field bytes. This is the only TRUE layout pin (compile-
    /// time asserts can't verify Borsh field positions — see `layout`). A field
    /// reorder/resize that drifts the consts fails here.
    #[test]
    fn offsets_match_borsh() {
        // --- JurorStake: distinctive values at every offset we slice ---
        let js = JurorStake {
            subaccord: Pubkey::new_from_array([0xA0; 32]),
            juror: Pubkey::new_from_array([0xA1; 32]),
            staked: 0x0102_0304_0506_0708,
            active_draws: 0x090A_0B0C,
            bump: 0x0D,
            tree_index: 0x0E0F_1011,
            stake_delta: 0x1213_1415_1617_1819,
            slash_reserve: 0x1A1B_1C1D_1E1F_2021,
            withdraw_requested_at: 0x2223_2425_2627_2829,
            pending_withdrawal: 0x2A2B_2C2D_2E2F_3031,
            fees_earned: 0x3233_3435_3637_3839,
        };
        let mut buf = Vec::new();
        js.try_serialize(&mut buf).unwrap();
        assert_eq!(
            &buf[layout::JS_STAKED_OFF..layout::JS_STAKED_OFF + 8],
            &js.staked.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_ACTIVE_DRAWS_OFF..layout::JS_ACTIVE_DRAWS_OFF + 4],
            &js.active_draws.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_STAKE_DELTA_OFF..layout::JS_STAKE_DELTA_OFF + 8],
            &js.stake_delta.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_SLASH_RESERVE_OFF..layout::JS_SLASH_RESERVE_OFF + 8],
            &js.slash_reserve.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::JS_FEES_EARNED_OFF..layout::JS_FEES_EARNED_OFF + 8],
            &js.fees_earned.to_le_bytes()[..]
        );

        // --- AppealBond ---
        let ab = AppealBond {
            dispute: Pubkey::new_from_array([0xB0; 32]),
            round_idx: 0x0102_0304,
            appellant: Pubkey::new_from_array([0xB1; 32]),
            amount: 0x0506_0708_090A_0B0C,
            prior_result: 0x0D,
            bump: 0x0E,
        };
        let mut buf = Vec::new();
        ab.try_serialize(&mut buf).unwrap();
        assert_eq!(
            &buf[layout::AB_ROUND_IDX_OFF..layout::AB_ROUND_IDX_OFF + 4],
            &ab.round_idx.to_le_bytes()[..]
        );
        assert_eq!(
            &buf[layout::AB_AMOUNT_OFF..layout::AB_AMOUNT_OFF + 8],
            &ab.amount.to_le_bytes()[..]
        );
        assert_eq!(buf[layout::AB_PRIOR_OFF], ab.prior_result);
    }
}

#[cfg(test)]
mod vrf_identity_tests {
    /// ADR-0013: the callback validates the SCOPED per-program identity, not the
    /// deprecated global one. `request_vrf` issues a scoped request
    /// (`create_request_high_priority_scoped_randomness_ix`), so the oracle
    /// fulfills by signing with `scoped_vrf_identity(callback_program_id)`. This
    /// pins that the per-program PDA differs from the global
    /// `VRF_PROGRAM_IDENTITY` — the unit-level regression guard for the
    /// `CommitVrfCallback` `address =` constraint. The real oracle→callback path
    /// is never exercised in tests (they inject the VRF directly), so this delta
    /// is what catches a revert to the global constant.
    #[test]
    fn scoped_identity_differs_from_global() {
        let scoped = ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity(&crate::ID);
        let global = ephemeral_rollups_sdk::vrf::consts::VRF_PROGRAM_IDENTITY;
        assert_ne!(
            scoped, global,
            "scoped per-program identity must differ from the deprecated global constant"
        );
    }
}

#[program]
pub mod accord {
    use super::*;

    /// Liveness probe and LiteSVM harness anchor (veridao-8ys4).
    ///
    /// No state, no accounts — returns `Ok(())` and emits a version event.
    /// Arbitrables / ops may call it to confirm the program is reachable. It
    /// exists so the testing harness has a trivial instruction to round-trip;
    /// every subsequent instruction ships with its own LiteSVM `#[test]`.
    pub fn health(_ctx: Context<Health>) -> Result<()> {
        emit!(HealthChecked { version: 1 });
        Ok(())
    }

    // --- Circuit breaker (ADR-0007; veridao-63v3; scope split ADR-0016) ---
    // `pause` is instant + authority-gated; `unpause` is timelocked
    // (propose_unpause arms it, execute_unpause lands after the notice slot).
    // Split scope: while paused, only create_dispute / stake revert (new
    // exposure); appeal + finalize_dispute are never pausable, so in-flight
    // disputes always resolve and the pause authority cannot select an
    // adjudicative outcome. The halt is enforced inside create_dispute and
    // stake (`require!(!pause_state.paused, ProgramPaused)`); this module only
    // owns the breaker itself.

    /// One-time init of the pause singleton. The caller becomes the pause
    /// authority (typically the Squads multisig / upgrade authority). Call at
    /// deploy; front-running is an ops concern (bundle init with deploy).
    pub fn initialize_pause(ctx: Context<InitializePause>) -> Result<()> {
        ctx.accounts.pause_state.authority = ctx.accounts.authority.key();
        ctx.accounts.pause_state.paused = false;
        ctx.accounts.pause_state.pending_unpause_after = None;
        ctx.accounts.pause_state.bump = ctx.bumps.pause_state;
        Ok(())
    }

    /// Instant, authority-gated emergency freeze.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.pause_state.authority,
            AccordError::NotPauseAuthority
        );
        require!(!ctx.accounts.pause_state.paused, AccordError::AlreadyPaused);
        ctx.accounts.pause_state.paused = true;
        // a fresh pause cancels any pending unpause
        ctx.accounts.pause_state.pending_unpause_after = None;
        emit!(Paused {
            authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }

    /// Authority-gated: arms an unpause executable after `UNPAUSE_TIMELOCK_SLOTS`.
    pub fn propose_unpause(ctx: Context<ProposeUnpause>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.pause_state.authority,
            AccordError::NotPauseAuthority
        );
        require!(ctx.accounts.pause_state.paused, AccordError::NotPaused);
        let slot = Clock::get()?.slot;
        let execute_after = slot
            .checked_add(UNPAUSE_TIMELOCK_SLOTS)
            .ok_or(AccordError::ArithmeticOverflow)?;
        ctx.accounts.pause_state.pending_unpause_after = Some(execute_after);
        emit!(UnpauseProposed {
            execute_after_slot: execute_after,
        });
        Ok(())
    }

    /// Permissionless crank: lands the unpause once the notice slot has passed.
    pub fn execute_unpause(ctx: Context<ExecuteUnpause>) -> Result<()> {
        let execute_after = ctx
            .accounts
            .pause_state
            .pending_unpause_after
            .ok_or(AccordError::NoPendingUnpause)?;
        let slot = Clock::get()?.slot;
        require!(
            slot >= execute_after,
            AccordError::UnpauseTimelockNotElapsed
        );
        let authority = ctx.accounts.pause_state.authority;
        ctx.accounts.pause_state.paused = false;
        ctx.accounts.pause_state.pending_unpause_after = None;
        emit!(Unpaused { authority });
        Ok(())
    }

    // --- Subaccord management (ADR-0005; veridao-ek65) ---

    /// Permissionless creation of a specialized Juror pool. Seeds
    /// `["subaccord", creator, risk_type]`, so each creator owns a private
    /// namespace per `risk_type`. `risk_type` + `evidence_spec` are immutable
    /// identity hashes; every other param routes through propose/execute
    /// (ADR-0005). `authority == Pubkey::default()` => immutable.
    pub fn create_subaccord(
        ctx: Context<CreateSubaccord>,
        risk_type: [u8; 32],
        evidence_spec: [u8; 32],
        params: CreateSubaccordParams,
    ) -> Result<()> {
        let CreateSubaccordParams {
            min_stake,
            alpha_bps,
            review_window,
            commit_window,
            reveal_window,
            appeal_window,
            max_appeals,
            aggregation,
            fee_per_juror,
            reveal_threshold_bps,
            shortfall_policy,
            max_draw_attempts,
            authority,
            evidence_operator,
            depth,
            juror_credential,
            juror_schema,
        } = params;
        // Namespace guard: reject the degenerate zero-hash risk_type so the
        // default identity can't be silently squatting a namespace.
        require!(risk_type != [0u8; 32], AccordError::InvalidOptions);
        // Appeal-bond arrays on `Dispute` are sized to `MAX_APPEALS`; a
        // Subaccord may not promise more appeals than the program can custody.
        // The round-1 panel is the fixed `INITIAL_NUM_JURORS` (=3), so the
        // ladder 3 → 7 → 15 → 31 always fits `MAX_JURORS` at `max_appeals ≤ 3`.
        require!(
            max_appeals as usize <= MAX_APPEALS,
            AccordError::MaxAppealsLimitExceeded
        );
        // ADR-0021: validate the reveal-quorum config.
        require!(
            reveal_threshold_bps <= 10_000,
            AccordError::InvalidThreshold
        );
        require!(
            max_draw_attempts >= 1 && max_draw_attempts <= MAX_DRAW_ATTEMPTS,
            AccordError::MaxDrawAttemptsLimitExceeded
        );
        // Accumulator depth bounds the pool at 2^depth. Cap at 31 (u32 index
        // headroom + sane rent/depth tradeoff); the common default is 20.
        require!(depth <= 31, AccordError::TreeFull);
        // ADR-0022: appeal window is per-Subaccord with a non-zero floor. A pool
        // that wants no appeals sets `max_appeals == 0` (the explicit knob); a 0
        // window would silently disable the appeal safety valve.
        require!(
            appeal_window >= MIN_APPEAL_WINDOW_SECS,
            AccordError::AppealWindowTooShort
        );
        // PROG-ATTESTTION: credential binding is both-or-neither. A half-bound
        // Subaccord (credential set, schema unset — or vice versa) is rejected;
        // both `Pubkey::default()` ⇒ stake-only (today's behavior, unchanged).
        require!(
            (juror_credential == Pubkey::default()) == (juror_schema == Pubkey::default()),
            AccordError::AttestationBindingPartial
        );

        let acc = &mut ctx.accounts.subaccord;
        acc.creator = ctx.accounts.creator.key();
        acc.staking_token = ctx.accounts.staking_token.key();
        acc.fee_token = ctx.accounts.fee_token.key();
        acc.min_stake = min_stake;
        acc.alpha_bps = alpha_bps;
        acc.review_window = review_window;
        acc.commit_window = commit_window;
        acc.reveal_window = reveal_window;
        acc.appeal_window = appeal_window;
        acc.max_appeals = max_appeals;
        acc.aggregation = aggregation;
        acc.fee_per_juror = fee_per_juror;
        acc.reveal_threshold_bps = reveal_threshold_bps;
        acc.shortfall_policy = shortfall_policy;
        acc.max_draw_attempts = max_draw_attempts;
        acc.authority = authority;
        acc.evidence_operator = evidence_operator;
        acc.risk_type = risk_type;
        acc.evidence_spec = evidence_spec;
        // Immutable identity-triplet extension (PROG-ATTESTTION).
        acc.juror_credential = juror_credential;
        acc.juror_schema = juror_schema;
        acc.bump = ctx.bumps.subaccord;
        // ADR-0012 accumulator: start as an all-zero tree at the fixed depth.
        acc.depth = depth;
        acc.next_index = 0;
        acc.total_stake = 0;
        acc.root_hash = empty_tree_root(depth);

        emit!(SubaccordCreated {
            creator: ctx.accounts.creator.key(),
            subaccord: acc.key(),
            staking_token: ctx.accounts.staking_token.key(),
            fee_token: ctx.accounts.fee_token.key(),
            risk_type,
        });
        Ok(())
    }

    /// Stake Juror capital into a Subaccord. SPL-transfers `amount` of the
    /// Subaccord's `staking_token` from the Juror's ATA into the Subaccord
    /// PDA's stake_vault ATA (lazily created on first stake). The `JurorStake` PDA is
    /// init'd on first stake and topped up on subsequent stakes.
    ///
    /// ADR-0012: the caller supplies the juror's accumulator Merkle `path`. The
    /// chain verifies it against the stored root, credits the **actual delta**
    /// the vault received (fee-on-transfer safe), and recomputes the path to a
    /// new canonical root — O(log N). A wrong (stale/fabricated) path reverts,
    /// leaving the root untouched. Reverts while the circuit breaker is paused.
    pub fn stake(ctx: Context<Stake>, amount: u64, path: Vec<MSTNode>) -> Result<()> {
        require!(!ctx.accounts.pause_state.paused, AccordError::ProgramPaused);
        require!(amount > 0, AccordError::InvalidAmount);
        // PROG-ATTESTTION: optional credential gate. On a credential-gated
        // Subaccord (`juror_credential != default`), the juror must supply a
        // valid SAS attestation in `remaining_accounts[0]`. On a stake-only
        // Subaccord (both fields `default()`) this block is skipped entirely —
        // today's behavior is unchanged. Scoped so the immutable borrow ends
        // before the mutable `sub` borrow below.
        {
            let sub_acc = &ctx.accounts.subaccord;
            if sub_acc.juror_credential != Pubkey::default() {
                require!(
                    !ctx.remaining_accounts.is_empty(),
                    AccordError::AttestationMissing
                );
                let att = &ctx.remaining_accounts[0];
                let now = Clock::get()?.unix_timestamp;
                let cutoff = now
                    .checked_add(attestation_horizon(sub_acc)?)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                let expiry = validate_sas_attestation(
                    att,
                    &sub_acc.juror_credential,
                    &sub_acc.juror_schema,
                    &ctx.accounts.juror.key(),
                )?;
                // `expiry == 0` ⇒ never expires; otherwise it must outlive the
                // max dispute lifecycle so the credential can't lapse mid-dispute.
                require!(
                    expiry == 0 || expiry > cutoff,
                    AccordError::AttestationExpired
                );
            }
        }

        let before = ctx.accounts.stake_vault.amount;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.juror_token_account.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.juror.to_account_info(),
                },
            ),
            amount,
        )?;

        // Fee-on-transfer safe: reload + credit the real delta the vault got.
        ctx.accounts.stake_vault.reload()?;
        let after = ctx.accounts.stake_vault.amount;
        let delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Parallel vault ledger (bean accord-fdad): track the real SPL delta.
        // Ledger-only ops (slash, request_withdraw) never touch this — only
        // actual token transfers in/out of the vault.

        let juror_key = ctx.accounts.juror.key();
        let js = &mut ctx.accounts.juror_stake;
        let sub = &mut ctx.accounts.subaccord;

        // A fresh JurorStake account is zero-filled by `init_if_needed`, so its
        // `subaccord` field is `default()` until we write it — the reliable
        // first-stake signal. An existing juror (top-up / re-stake after full
        // unstake) already has its `tree_index`.
        let is_new_leaf = js.subaccord == Pubkey::default();
        let old_stake = js.staked;
        let index = if is_new_leaf {
            require!(
                (sub.next_index as u64) < (1u64 << sub.depth.min(31)),
                AccordError::TreeFull
            );
            sub.next_index
        } else {
            require!(js.juror == juror_key, AccordError::InvalidMembershipProof);
            js.tree_index
        };

        // The accumulator leaf currently at `index`: a fresh slot is the
        // all-zero leaf `(default, 0)`; an existing juror's slot carries its
        // live `(juror, amount)`.
        let (old_juror, old_leaf_stake) = if is_new_leaf {
            (Pubkey::default(), 0u64)
        } else {
            (juror_key, old_stake)
        };

        let new_stake = old_stake
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // REVIEW #5 backstop: the position-opening deposit must clear the
        // draw-time free-stake threshold — min_stake + α·min_stake — or the
        // juror can never be drawn (each draw_seat reserves α·min_stake and
        // requires free stake ≥ min_stake + α·min_stake). Staking exactly
        // min_stake is the footgun this closes. Top-ups are NOT gated: only the
        // first deposit that opens the JurorStake leaf.
        if is_new_leaf {
            let slash_per_juror = (sub.alpha_bps as u64)
                .checked_mul(sub.min_stake)
                .and_then(|v| v.checked_div(10_000))
                .ok_or(AccordError::ArithmeticOverflow)?;
            let min_initial = sub
                .min_stake
                .checked_add(slash_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
            require!(new_stake >= min_initial, AccordError::InsufficientStake);
        }

        // Verify the supplied path against the stored root, then recompute the
        // root for the new leaf stake. The juror identity may change
        // (default→real) on first stake; afterwards it is stable.
        let (new_root, new_total) = verify_and_recompute(
            &old_juror,
            old_leaf_stake,
            &juror_key,
            new_stake,
            index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        if is_new_leaf {
            js.subaccord = sub.key();
            js.juror = juror_key;
            js.bump = ctx.bumps.juror_stake;
            js.tree_index = index;
            sub.next_index = sub
                .next_index
                .checked_add(1)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }
        // active_draws intentionally untouched: 0 on fresh init, preserved on top-up.

        // Coarse distinct-staker counter (SPEC intake gate). First-ever stake
        // (0 -> positive) and re-stake after a full unstake both increment; a
        // full unstake decrements (see `unstake`).
        let prev_staked = js.staked;
        js.staked = new_stake;
        if prev_staked == 0 {
            sub.staker_count = sub
                .staker_count
                .checked_add(1)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }

        sub.root_hash = new_root;
        sub.total_stake = new_total;
        sub.stake_vault_deposited = sub
            .stake_vault_deposited
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        emit!(Staked {
            subaccord: sub.key(),
            juror: juror_key,
            amount: delta,
        });
        Ok(())
    }

    /// **Phase 1 of two-phase withdraw** (REVIEW #5): declares intent to
    /// withdraw `amount` tokens. Ledger-only — no SPL transfer (that is
    /// `withdraw`'s job). Updates the accumulator root immediately (juror's
    /// sortition weight drops right away), reduces `JurorStake.staked`, and
    /// banks the tokens in `pending_withdrawal` until `withdraw` executes.
    ///
    /// ADR-0012: the caller supplies the juror's accumulator Merkle `path`; the
    /// chain verifies it against the stored root and recomputes a new root for
    /// the reduced leaf stake. A full unstake zeros the leaf's selection weight
    /// but retains its `tree_index` (re-stake is a local update).
    ///
    /// **Precondition (DRY with `reconcile_stake`):** `stake_delta` must be
    /// zero. Pending reward/slash is folded into `staked` by the permissionless
    /// `reconcile_stake` crank — call it first. Without this invariant a pending
    /// reward inflated `free_stake` past what `staked` could honor, so the
    /// subtraction underflowed. Withdraw only operates on a canonical ledger.
    ///
    /// Gates: `amount ≤ staked − slash_reserve` (free stake; the reserve covers
    /// in-flight draw slashes). No `active_draws` gate here — that lock is
    /// enforced at `withdraw`. Allowed while the program is paused (ADR-0007:
    /// only create_dispute / stake are halted — capital is never trapped).
    pub fn request_withdraw(
        ctx: Context<RequestWithdraw>,
        amount: u64,
        path: Vec<MSTNode>,
    ) -> Result<()> {
        require!(amount > 0, AccordError::InvalidAmount);
        // M-1: reject repeated calls while a withdrawal is pending — forces the
        // juror to complete the two-phase flow (withdraw) before requesting again.
        require!(
            ctx.accounts.juror_stake.pending_withdrawal == 0,
            AccordError::WithdrawalPending
        );

        let juror_key = ctx.accounts.juror.key();
        let js = &mut ctx.accounts.juror_stake;
        let sub = &mut ctx.accounts.subaccord;

        // DRY with reconcile_stake: the ledger must be canonical (no pending
        // reward/slash) before we touch `staked`. `reconcile_stake` folds the
        // delta first; withdraw only ever reads the canonical `staked`.
        require!(js.stake_delta == 0, AccordError::PendingSettlement);

        // Cannot withdraw more than the free stake: raw amount minus the slash
        // reserve held against in-flight draws.
        let free_stake = js.staked.saturating_sub(js.slash_reserve);
        require!(amount <= free_stake, AccordError::InsufficientBalance);

        let old_stake = js.staked;
        let new_stake = old_stake
            .checked_sub(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let index = js.tree_index;

        let (new_root, new_total) = verify_and_recompute(
            &juror_key,
            old_stake,
            &juror_key,
            new_stake,
            index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        js.staked = new_stake;
        js.pending_withdrawal = js
            .pending_withdrawal
            .checked_add(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;
        js.withdraw_requested_at = Clock::get()?.unix_timestamp;

        if new_stake == 0 && old_stake > 0 {
            sub.staker_count = sub.staker_count.saturating_sub(1);
        }

        sub.root_hash = new_root;
        sub.total_stake = new_total;

        emit!(Unstaked {
            subaccord: sub.key(),
            juror: juror_key,
            amount,
        });
        Ok(())
    }

    /// **Phase 2 of two-phase withdraw** (REVIEW #5): transfers locked tokens
    /// from the stake_vault to the juror's ATA. Requires `WITHDRAWAL_DELAY` to have
    /// elapsed since `request_withdraw` AND `active_draws == 0`.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let js = &mut ctx.accounts.juror_stake;
        require!(js.pending_withdrawal > 0, AccordError::NoPendingWithdrawal);

        let now = Clock::get()?.unix_timestamp;
        let deadline = js
            .withdraw_requested_at
            .checked_add(WITHDRAWAL_DELAY)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now >= deadline, AccordError::WithdrawalTooEarly);
        require!(js.active_draws == 0, AccordError::StakeLocked);

        let amount = js.pending_withdrawal;
        js.pending_withdrawal = 0;
        js.withdraw_requested_at = 0;

        let sub = &mut ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.risk_type.as_ref(),
            &bump,
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.juror_token_account.to_account_info(),
                    authority: sub.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
        )?;

        // Parallel vault ledger (bean accord-fdad): track the SPL withdrawal.
        sub.stake_vault_withdrawn = sub
            .stake_vault_withdrawn
            .checked_add(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;

        emit!(Unstaked {
            subaccord: sub.key(),
            juror: ctx.accounts.juror.key(),
            amount,
        });
        Ok(())
    }

    /// **Permissionless crank** (REVIEW #4): folds a juror's `stake_delta`
    /// into their canonical `staked` and updates the accumulator root via a
    /// Merkle proof. After reconcile, the ledger and accumulator agree again.
    ///
    /// Any caller may trigger this — no tokens move, it's pure ledger + root
    /// accounting. The cranker supplies the juror's Merkle path (same format as
    /// `stake`/`unstake`), which authenticates the old leaf against the stored
    /// root and recomputes a new root for the adjusted amount.
    pub fn reconcile_stake(ctx: Context<ReconcileStake>, path: Vec<MSTNode>) -> Result<()> {
        let js = &mut ctx.accounts.juror_stake;
        let sub = &mut ctx.accounts.subaccord;

        require!(js.stake_delta != 0, AccordError::InvalidAmount);

        let old_amount = js.staked;
        let new_amount = (js.staked as i64).saturating_add(js.stake_delta).max(0) as u64;

        let (new_root, new_total) = verify_and_recompute(
            &js.juror,
            old_amount,
            &js.juror,
            new_amount,
            js.tree_index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        js.staked = new_amount;
        js.stake_delta = 0;
        sub.root_hash = new_root;
        sub.total_stake = new_total;

        Ok(())
    }

    /// Permissionless crank (PROG-ATTESTTION): evicts an **expired-credential**
    /// juror from a gated Subaccord's accumulator. Without it, an expired juror
    /// still in the tree is a dead zone — if the VRF lands on them, `draw_seat`
    /// reverts at the freshness check and the cranker cannot advance. Anyone
    /// may call; the caller supplies the juror's Merkle `path` + the expired
    /// SAS attestation in `remaining_accounts[0]`.
    ///
    /// The body mirrors `request_withdraw` for the **full** `staked` amount:
    /// zeros the leaf's selection weight, recomputes the root, banks the tokens
    /// into `pending_withdrawal`, and decrements `staker_count`. The juror then
    /// completes the normal two-phase `withdraw` (or re-stakes with a renewed
    /// attestation). Only the trigger + signer differ from `request_withdraw`:
    /// the caller signs (permissionless), the juror does not — so `PruneJuror`
    /// is its own account struct, not `RequestWithdraw`.
    ///
    /// Gates: gated Subaccords only; the attestation must have a real expiry
    /// (`!= 0`) that has passed (`<= now`) — a never-expiring credential can
    /// never be pruned. Banking the full stake requires no outstanding slash
    /// reserve (⇔ no in-flight draws), so a drawn juror settles those first.
    pub fn prune_juror(ctx: Context<PruneJuror>, path: Vec<MSTNode>) -> Result<()> {
        let sub = &mut ctx.accounts.subaccord;
        // Only meaningful for gated pools (stake-only Subaccords have nothing
        // to expire).
        require!(
            sub.juror_credential != Pubkey::default(),
            AccordError::AttestationMissing
        );

        // Expiry proof: the juror's attestation must be actually expired.
        require!(
            !ctx.remaining_accounts.is_empty(),
            AccordError::AttestationMissing
        );
        let att = &ctx.remaining_accounts[0];
        let expiry = validate_sas_attestation(
            att,
            &sub.juror_credential,
            &sub.juror_schema,
            &ctx.accounts.juror.key(),
        )?;
        let now = Clock::get()?.unix_timestamp;
        require!(
            expiry != 0 && expiry <= now,
            AccordError::AttestationNotExpired
        );

        let juror_key = ctx.accounts.juror.key();
        let js = &mut ctx.accounts.juror_stake;
        // DRY with request_withdraw: the ledger must be canonical first.
        require!(js.stake_delta == 0, AccordError::PendingSettlement);
        // No double-exit while a withdrawal is already pending.
        require!(js.pending_withdrawal == 0, AccordError::WithdrawalPending);
        let amount = js.staked;
        require!(amount > 0, AccordError::InvalidAmount);

        // Free-stake discipline (mirrors request_withdraw): banking the full
        // stake requires no slash reserve outstanding (⇔ no in-flight draws).
        let free_stake = js.staked.saturating_sub(js.slash_reserve);
        require!(amount <= free_stake, AccordError::InsufficientBalance);

        let old_stake = js.staked;
        let index = js.tree_index;
        let (new_root, new_total) = verify_and_recompute(
            &juror_key,
            old_stake,
            &juror_key,
            0,
            index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        js.staked = 0;
        js.pending_withdrawal = js
            .pending_withdrawal
            .checked_add(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;
        js.withdraw_requested_at = now;
        sub.staker_count = sub.staker_count.saturating_sub(1);
        sub.root_hash = new_root;
        sub.total_stake = new_total;

        emit!(Unstaked {
            subaccord: sub.key(),
            juror: juror_key,
            amount,
        });
        Ok(())
    }

    // --- Subaccord authority / timelock (ADR-0005; veridao-y63e) ---

    /// Authority-gated proposal of a Subaccord parameter update. The update is
    /// written to a `PendingUpdate` PDA keyed by `(subaccord, nonce)` and becomes
    /// executable only after `UPDATE_TIMELOCK_SLOTS` (48h) elapses — giving
    /// stakers a window to unstake before a change lands. No-op for immutable
    /// Subaccords (`authority == default`). The nonce is caller-chosen; PDA
    /// `init` enforces uniqueness (a reused nonce simply fails to init).
    pub fn propose_subaccord_update(
        ctx: Context<ProposeSubaccordUpdate>,
        nonce: u64,
        payload: UpdatePayload,
    ) -> Result<()> {
        let sub = &ctx.accounts.subaccord;
        require!(
            sub.authority != Pubkey::default(),
            AccordError::ImmutableSubaccord
        );
        require!(
            ctx.accounts.authority.key() == sub.authority,
            AccordError::Unauthorized
        );
        // H-1: reject invalid updates at propose time so the authority gets
        // immediate feedback instead of wasting the 48h timelock period.
        validate_update_payload(&payload)?;

        let slot = Clock::get()?.slot;
        let execute_after = slot
            .checked_add(UPDATE_TIMELOCK_SLOTS)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let pu = &mut ctx.accounts.pending_update;
        pu.subaccord = ctx.accounts.subaccord.key();
        pu.nonce = nonce;
        pu.proposed = payload.clone();
        pu.proposed_by = ctx.accounts.authority.key();
        pu.execute_after_slot = execute_after;
        pu.bump = ctx.bumps.pending_update;

        emit!(UpdateProposed {
            subaccord: ctx.accounts.subaccord.key(),
            nonce,
            payload,
            execute_after_slot: execute_after,
        });
        Ok(())
    }

    /// Permissionless crank: applies a timelocked `PendingUpdate` to its Subaccord
    /// once the 48h notice slot has passed. Anyone may execute — the timelock is
    /// the protection, not the executor. The `PendingUpdate` is closed (rent to
    /// the caller) once applied.
    pub fn execute_subaccord_update(ctx: Context<ExecuteSubaccordUpdate>) -> Result<()> {
        let nonce = ctx.accounts.pending_update.nonce;
        let execute_after = ctx.accounts.pending_update.execute_after_slot;
        let slot = Clock::get()?.slot;
        require!(slot >= execute_after, AccordError::TimelockNotElapsed);
        // H-1: defense-in-depth — re-validate at execute even though propose
        // already checked (§29.3: validate in every write path).
        validate_update_payload(&ctx.accounts.pending_update.proposed)?;

        let sub = &mut ctx.accounts.subaccord;
        match &ctx.accounts.pending_update.proposed {
            UpdatePayload::MinStake(v) => sub.min_stake = *v,
            UpdatePayload::AlphaBps(v) => sub.alpha_bps = *v,
            UpdatePayload::ReviewWindow(v) => sub.review_window = *v,
            UpdatePayload::CommitWindow(v) => sub.commit_window = *v,
            UpdatePayload::RevealWindow(v) => sub.reveal_window = *v,
            UpdatePayload::AppealWindow(v) => sub.appeal_window = *v,
            UpdatePayload::MaxAppeals(v) => sub.max_appeals = *v,
            UpdatePayload::FeePerJuror(v) => sub.fee_per_juror = *v,
            UpdatePayload::Authority(v) => sub.authority = *v,
            UpdatePayload::EvidenceOperator(v) => sub.evidence_operator = *v,
        }

        emit!(UpdateExecuted {
            subaccord: ctx.accounts.subaccord.key(),
            nonce,
        });
        Ok(())
    }

    // --- Dispute intake & Snapshot trust (ADR-0003/0004; veridao-rrxs) ---

    /// The **Arbitrable CPI entry**: any program files a Dispute. The filer pays
    /// the full round-1 fee (`INITIAL_NUM_JURORS · fee_per_juror`) into the
    /// Subaccord vault, so the on-chain fee is authoritative — the caller's
    /// `fee` must match exactly (defense-in-depth: the filer signs the exact
    /// charge). Reverts while paused (ADR-0007) and if the Subaccord has fewer
    /// distinct stakers than the required panel (`staker_count` coarse gate;
    /// ADR-0003 snapshot does the precise eligibility check at draw).
    pub fn create_dispute(
        ctx: Context<CreateDispute>,
        options: Vec<[u8; 32]>,
        evidence_hash: [u8; 32],
        nonce: u64,
        fee: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.pause_state.paused, AccordError::ProgramPaused);

        let n = options.len();
        require!((2..=MAX_OPTIONS).contains(&n), AccordError::InvalidOptions);

        let sub = &mut ctx.accounts.subaccord;
        let required_fee = (INITIAL_NUM_JURORS as u64)
            .checked_mul(sub.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(fee == required_fee, AccordError::FeeMismatch);

        require!(
            sub.staker_count >= INITIAL_NUM_JURORS,
            AccordError::InsufficientJurors
        );

        // Custody the fee: filer ATA -> Subaccord PDA fee_vault (ADR-0020).
        let before = ctx.accounts.fee_vault.amount;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.filer_token_account.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.filer.to_account_info(),
                },
            ),
            fee,
        )?;
        ctx.accounts.fee_vault.reload()?;
        let after = ctx.accounts.fee_vault.amount;
        let delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;
        sub.fee_vault_deposited = sub
            .fee_vault_deposited
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let num_options = n as u8;
        let mut opt_arr = [[0u8; 32]; MAX_OPTIONS];
        for (i, o) in options.iter().enumerate() {
            opt_arr[i] = *o;
        }

        let d = &mut ctx.accounts.dispute;
        d.subaccord = sub.key();
        d.filer = ctx.accounts.filer.key();
        d.nonce = nonce;
        d.num_options = num_options;
        d.options = opt_arr;
        d.evidence_hashes[0] = evidence_hash;
        d.state = DisputeState::Created;
        d.current_round = 0;
        d.final_ruling = u8::MAX;
        d.finalized_at = 0;
        d.fee_paid = fee;
        // Ugly 4: record the filing timestamp so cancel_dispute has a pre-draw
        // anchor (snapshot/VRF liveness backstop).
        d.filed_at = Clock::get()?.unix_timestamp;
        // Ugly 6: freeze the economics-relevant params at filing time so the
        // 48h timelock (ADR-0005) cannot shift slashing/fees/panel/windows
        // mid-dispute. All later instructions read `d.terms`, never live `sub`.
        d.terms = CaseTerms {
            alpha_bps: sub.alpha_bps,
            min_stake: sub.min_stake,
            fee_per_juror: sub.fee_per_juror,
            review_window: sub.review_window,
            commit_window: sub.commit_window,
            reveal_window: sub.reveal_window,
            appeal_window: sub.appeal_window,
            max_appeals: sub.max_appeals,
            aggregation: sub.aggregation,
            reveal_threshold_bps: sub.reveal_threshold_bps,
            shortfall_policy: sub.shortfall_policy,
            max_draw_attempts: sub.max_draw_attempts,
        };
        d.bump = ctx.bumps.dispute;

        emit!(DisputeCreated {
            dispute: d.key(),
            subaccord: sub.key(),
            filer: ctx.accounts.filer.key(),
            num_options,
        });
        Ok(())
    }

    // --- Draw (ADR-0012 accumulator; veridao-fr1x/veridao-4nyi) -----------------

    /// Request VRF randomness from the magicblock oracle (ADR-0009/veridao-crbf).
    /// CPIs into the VRF program, which calls back `commit_vrf_callback` with
    /// the verified random value AND atomically freezes the accumulator root.
    /// Permissionless — any cranker may request. One-shot per dispute (errors
    /// if `committed_vrf` already set). No snapshot step (ADR-0012): the
    /// dispute goes straight from `Created` to a frozen root at callback time.
    #[allow(unused_variables)]
    pub fn request_vrf(ctx: Context<RequestVrf>) -> Result<()> {
        let dispute = &ctx.accounts.dispute;
        require!(
            dispute.state != DisputeState::Failed,
            AccordError::DisputeFailed
        );
        require!(
            dispute.state == DisputeState::Created,
            AccordError::InvalidState
        );
        require!(
            dispute.committed_vrf.is_none(),
            AccordError::VrfAlreadyCommitted
        );

        let dispute_key = dispute.key();
        let subaccord_key = ctx.accounts.subaccord.key();
        // Forward both the dispute (writable — callback writes VRF + frozen
        // root) and the subaccord (read-only — callback copies its live root).
        let ix = create_request_high_priority_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.caller.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: instruction::CommitVrfCallback::DISCRIMINATOR.to_vec(),
            caller_seed: dispute_key.to_bytes(),
            // ORDER IS LOAD-BEARING: the VRF oracle prepends the scoped
            // vrf_program_identity, then appends these metas positionally onto
            // the CommitVrfCallback struct fields. So this list MUST mirror the
            // callback struct field order AFTER the identity: [subaccord,
            // dispute]. A swap lands `dispute` on the `subaccord` field and
            // fails the callback with AccountDiscriminatorMismatch — which the
            // oracle observes via pre-simulation and never submits (the request
            // then stalls at its queue index indefinitely).
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: subaccord_key,
                    is_signer: false,
                    is_writable: false,
                },
                SerializableAccountMeta {
                    pubkey: dispute_key,
                    is_signer: false,
                    is_writable: true,
                },
            ]),
            ..Default::default()
        });

        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.caller.to_account_info(), &ix)?;

        emit!(VrfRequested {
            dispute: dispute_key,
        });
        Ok(())
    }

    /// VRF callback: stores the oracle-verified random value (ADR-0009) AND
    /// atomically freezes the accumulator root (ADR-0012). ONLY the VRF program
    /// can call this — `vrf_program_identity` is constrained to the scoped
    /// per-program identity `scoped_vrf_identity(&crate::ID)` (ADR-0013), not
    /// the deprecated global constant. Freezing here (not at `create_dispute`) closes
    /// the manipulation window: pre-callback the VRF is blind, post-callback
    /// the root is inert. One VRF + one frozen root serve the whole dispute.
    pub fn commit_vrf_callback(
        ctx: Context<CommitVrfCallback>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state != DisputeState::Failed,
            AccordError::DisputeFailed
        );
        require!(
            dispute.committed_vrf.is_none(),
            AccordError::VrfAlreadyCommitted
        );
        dispute.committed_vrf = Some(randomness);
        // ADR-0012: freeze the live accumulator root atomically with the VRF.
        dispute.frozen_root = ctx.accounts.subaccord.root_hash;
        dispute.frozen_total_stake = ctx.accounts.subaccord.total_stake;
        emit!(VrfCommitted {
            dispute: dispute.key(),
            vrf_result: randomness,
            frozen_root: dispute.frozen_root,
        });
        Ok(())
    }

    /// Draw a single seat against the frozen accumulator root (ADR-0012). The
    /// 1232-byte tx packet cannot hold N Merkle proofs, so the panel is filled
    /// one seat per transaction; the round is `init_if_needed` and persists
    /// across the N `draw_seat` calls.
    ///
    /// The chain is a dumb verifier: it checks the membership proof against
    /// `dispute.frozen_root`, reconstructs the cumulative-from-left prefix from
    /// the authenticated sibling sums, enforces the sortition criterion
    /// (`prefix ≤ r_i < prefix + stake`, where `r_i` is deterministically
    /// derived from the frozen VRF + seat index + retry counter), the inflation
    /// guard (`JurorStake.staked ≥ leaf.stake`), and distinctness vs already-drawn
    /// seats.
    ///
    /// **Deterministic collision re-roll** (bean accord-tzo0): the cranker
    /// supplies `retries` — how many times the deterministic `r_i` landed on an
    /// already-drawn juror before hitting the submitted leaf. The chain verifies
    /// every prior retry (0..retries) genuinely collided with a drawn seat's
    /// range (stored in `round.seat_prefix`/`seat_stake`), eliminating caller
    /// choice. One seed → exactly one valid panel; no `draw_attempt` grind.
    /// When the last seat lands, the round windows open and the dispute
    /// transitions to `Drawn`.
    pub fn draw_seat(
        ctx: Context<DrawSeat>,
        seat: u32,
        retries: u32,
        membership: JurorMembership,
    ) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Created,
            AccordError::InvalidState
        );
        let committed_vrf = dispute.committed_vrf.ok_or(AccordError::VrfNotCommitted)?;
        require!(dispute.frozen_total_stake > 0, AccordError::VrfNotCommitted);

        let round_idx = dispute.current_round;
        let panel = panel_size_for_round(round_idx)?;
        require!(seat < panel, AccordError::InvalidPanelSize);

        let leaf = &membership.leaf;
        require!(
            leaf.juror != Pubkey::default(),
            AccordError::InvalidMembershipProof
        );
        require!(
            leaf.stake >= dispute.terms.min_stake,
            AccordError::InsufficientStake
        );

        // Verify membership + reconstruct the cumulative-from-left prefix.
        let prefix = verify_membership_and_prefix(
            leaf,
            membership.index,
            &membership.proof,
            &dispute.frozen_root,
            dispute.frozen_total_stake,
        )?;

        // Load the round (init_if_needed — persists across the N seat txs).
        // Loaded BEFORE sortition: the collision check reads prior seats' ranges.
        let dispute_key = dispute.key();
        {
            let info = ctx.accounts.round.to_account_info();
            let mut data = info.try_borrow_mut_data()?;
            if data[..8].iter().all(|&b| b == 0) {
                data[..8].copy_from_slice(&Round::DISCRIMINATOR);
            }
        }
        let mut round = ctx.accounts.round.load_mut()?;
        if round.dispute == Pubkey::default() {
            round.dispute = dispute_key;
            round.round_idx = round_idx;
            round.bump = ctx.bumps.round;
            round.juror_count = 0;
            round.commit_count = 0;
            round.reveal_count = 0;
            round.result = u8::MAX;
            round.commits = [[0u8; 32]; MAX_JURORS];
            round.reveals = [u8::MAX; MAX_JURORS];
        }
        require!(
            round.dispute == dispute_key && round.round_idx == round_idx,
            AccordError::InvalidState
        );

        // Seat must be the next sequential unfilled slot (REVIEW #6).
        require!(seat == round.juror_count, AccordError::InvalidPanelSize);

        // --- Deterministic sortition with on-chain collision re-roll (tzo0) ---
        //
        // r_i(retry) = u64_le(sha256(vrf_seed ‖ seat ‖ retry)[0..8]) % total
        // For retry < retries: r_i MUST land inside an already-drawn seat's range
        //   (a genuine collision — the cranker cannot skip a non-colliding retry
        //   to cherry-pick a preferred juror at a later retry).
        // For retry == retries: r_i MUST select the submitted leaf.
        require!(
            retries <= MAX_SORTITION_RETRIES,
            AccordError::MaxRetriesExceeded
        );

        let vrf_seed = {
            use solana_program::hash::hashv;
            // ADR-0021: `draw_attempt` salts the seed so a shortfall redraw
            // selects fresh seats without advancing `round_idx` (which would
            // grow the panel / consume an appeal budget).
            hashv(&[
                &committed_vrf,
                dispute_key.as_ref(),
                &round_idx.to_le_bytes(),
                &round.draw_attempt.to_le_bytes(),
            ])
            .to_bytes()
        };

        for retry in 0..=retries {
            let r_i = {
                use solana_program::hash::hashv;
                let rh = hashv(&[&vrf_seed, &seat.to_le_bytes(), &retry.to_le_bytes()]).to_bytes();
                u64::from_le_bytes(rh[0..8].try_into().unwrap_or([0u8; 8]))
                    % dispute.frozen_total_stake
            };
            if retry < retries {
                // Prior retry: must collide with an already-drawn seat's range.
                let mut collided = false;
                for j in 0..(seat as usize) {
                    let p = round.seat_prefix[j];
                    let s = round.seat_stake[j];
                    if s > 0 && r_i >= p && r_i - p < s {
                        collided = true;
                        break;
                    }
                }
                require!(collided, AccordError::SortitionMismatch);
            } else {
                // Terminal retry: r_i must select the submitted leaf.
                require!(r_i >= prefix, AccordError::SortitionMismatch);
                require!(r_i - prefix < leaf.stake, AccordError::SortitionMismatch);
            }
        }

        // Juror must be distinct from already-drawn seats.
        for j in 0..(panel as usize) {
            require!(round.jurors[j] != leaf.juror, AccordError::DuplicateJuror);
        }

        // Store the drawn seat's range for future collision checks.
        round.seat_prefix[seat as usize] = prefix;
        round.seat_stake[seat as usize] = leaf.stake;

        // Inflation guard + slash reserve check via remaining_accounts[0].
        // PROG-ATTESTTION: gated pools also carry the juror's SAS attestation
        // as remaining_accounts[1] (defense-in-depth draw-time re-check below).
        let gated = ctx.accounts.subaccord.juror_credential != Pubkey::default();
        require!(
            ctx.remaining_accounts.len() == if gated { 2 } else { 1 },
            AccordError::InvalidPanelSize
        );
        let js_info = &ctx.remaining_accounts[0];
        let expected_pda = Pubkey::find_program_address(
            &[
                SEED_JUROR_STAKE,
                dispute.subaccord.as_ref(),
                leaf.juror.as_ref(),
            ],
            &crate::ID,
        )
        .0;
        require!(
            js_info.key == &expected_pda,
            AccordError::InvalidMembershipProof
        );
        require!(
            js_info.owner == &crate::ID,
            AccordError::InvalidMembershipProof
        );
        let slash_per_juror = (dispute.terms.alpha_bps as u64)
            .checked_mul(dispute.terms.min_stake)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;
        let (current_draws, new_slash_reserve) = {
            let data = js_info.try_borrow_data()?;
            let js = JurorStake::try_deserialize(&mut &data[..])?;
            require!(js.juror == leaf.juror, AccordError::InvalidMembershipProof);
            // ADR-0012 inflation guard: live staked must cover the frozen leaf.
            require!(js.staked >= leaf.stake, AccordError::InflatedStake);
            // REVIEW #5: free stake must cover this draw's slash + min_stake.
            let free_stake = js.staked.saturating_sub(js.slash_reserve);
            let required = dispute
                .terms
                .min_stake
                .checked_add(slash_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
            require!(free_stake >= required, AccordError::InsufficientStake);
            let new_reserve = js
                .slash_reserve
                .checked_add(slash_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
            (js.active_draws, new_reserve)
        };
        let new_draws = current_draws
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;
        {
            let mut data = js_info.try_borrow_mut_data()?;
            // CU-opt field write — see `crate::layout` (raw remaining_accounts
            // AccountInfo: no Anchor auto-serialize; write only the 2 changed fields).
            const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
            const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
            data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                .copy_from_slice(&new_draws.to_le_bytes());
            data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                .copy_from_slice(&new_slash_reserve.to_le_bytes());
        }
        // PROG-ATTESTTION: defense-in-depth credential re-check. With the prune
        // crank an expired juror should already be evicted from the accumulator;
        // this catches the race (credential expired between prune-eligible and
        // prune-called). One attestation read + one timestamp compare, only on
        // gated pools. At draw time only `expiry > now` is required (the
        // stake-time horizon gate already bounded the entry).
        if gated {
            let att = &ctx.remaining_accounts[1];
            let now = Clock::get()?.unix_timestamp;
            let expiry = validate_sas_attestation(
                att,
                &ctx.accounts.subaccord.juror_credential,
                &ctx.accounts.subaccord.juror_schema,
                &leaf.juror,
            )?;
            require!(expiry == 0 || expiry > now, AccordError::AttestationExpired);
        }

        round.jurors[seat as usize] = leaf.juror;
        round.juror_count = round
            .juror_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // When the panel fills, open the round windows and transition to Drawn.
        // Ugly 6: windows are filing-time (frozen on the dispute).
        if round.juror_count >= panel {
            let now_ts = Clock::get()?.unix_timestamp;
            let review_end = now_ts
                .checked_add(dispute.terms.review_window as i64)
                .ok_or(AccordError::ArithmeticOverflow)?;
            let commit_end = review_end
                .checked_add(dispute.terms.commit_window as i64)
                .ok_or(AccordError::ArithmeticOverflow)?;
            let reveal_end = commit_end
                .checked_add(dispute.terms.reveal_window as i64)
                .ok_or(AccordError::ArithmeticOverflow)?;
            round.review_end = review_end;
            round.commit_end = commit_end;
            round.reveal_end = reveal_end;
            dispute.state = DisputeState::Drawn;
        }

        emit!(SeatDrawn {
            dispute: dispute_key,
            round_idx,
            seat,
            juror: leaf.juror,
        });
        Ok(())
    }

    // --- Voting & Ruling (veridao-pq1s) ---------------------------------------

    /// Commit a vote hash. `h = hash(vote_le ‖ salt ‖ juror_pubkey)` — the
    /// juror's pubkey is bound into the hash to prevent commit-copying (a juror
    /// who copies another's hash can never reveal it). One per drawn Juror;
    /// immutable after commit. Allowed during the commit window
    /// (`review_end ≤ now < commit_end`).
    pub fn commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Drawn || dispute.state == DisputeState::Commit,
            AccordError::InvalidState
        );

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= round.review_end, AccordError::CommitWindowClosed);
        require!(now < round.commit_end, AccordError::CommitWindowClosed);

        let juror_key = ctx.accounts.juror.key();
        let idx = round.jurors[..round.juror_count as usize]
            .iter()
            .position(|j| *j == juror_key)
            .ok_or(AccordError::NotDrawnJuror)?;

        require!(
            round.commits[idx] == [0u8; 32],
            AccordError::CommitAlreadyExists
        );
        round.commits[idx] = commitment;
        round.commit_count = round
            .commit_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        if dispute.state == DisputeState::Drawn {
            dispute.state = DisputeState::Commit;
        }

        emit!(Committed {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            juror: juror_key,
        });
        Ok(())
    }

    /// Reveal a committed vote. Verifies `hash(vote_le ‖ salt ‖ juror_pubkey)`
    /// matches the stored commit, records the vote. ADR-0020: vote-recording
    /// only — no fee credit, no SPL transfer. The participation fee is credited
    /// to `JurorStake.fees_earned` at `finalize_round` instead (aggregated, not
    /// per-reveal ATA creation). Allowed during the reveal window
    /// (`commit_end ≤ now < reveal_end`).
    pub fn reveal(ctx: Context<Reveal>, vote: u8, salt: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Commit || dispute.state == DisputeState::Reveal,
            AccordError::InvalidState
        );

        require!(vote < dispute.num_options, AccordError::InvalidVote);

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= round.commit_end, AccordError::RevealWindowClosed);
        require!(now < round.reveal_end, AccordError::RevealWindowClosed);

        let juror_key = ctx.accounts.juror.key();
        let idx = round.jurors[..round.juror_count as usize]
            .iter()
            .position(|j| *j == juror_key)
            .ok_or(AccordError::NotDrawnJuror)?;

        let committed = round.commits[idx];
        require!(committed != [0u8; 32], AccordError::CommitMissing);
        require!(round.reveals[idx] == u8::MAX, AccordError::AlreadyRevealed);

        use solana_program::hash::hashv;
        let computed = hashv(&[&[vote], &salt, juror_key.as_ref()]).to_bytes();
        require!(computed == committed, AccordError::RevealMismatch);

        round.reveals[idx] = vote;
        round.reveal_count = round
            .reveal_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        if dispute.state == DisputeState::Commit {
            dispute.state = DisputeState::Reveal;
        }

        emit!(Revealed {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            juror: juror_key,
            vote,
        });
        Ok(())
    }

    /// Permissionless crank: after the reveal window elapses, tallies the
    /// round. ADR-0021 gates the tally on a reveal quorum:
    ///
    /// - **Quorum met** (`reveal_count >= ceil(panel × threshold_bps / 10_000)`):
    ///   credits each revealer's `fees_earned` (ADR-0020), sets the plurality
    ///   `result`, and transitions to `RoundResolved` (appeal window / final).
    /// - **Quorum not met**: no credits, no result — transitions to
    ///   `RedrawEligible` so the `redraw` crank can reconvene the panel (or, on
    ///   `max_draw_attempts` exhaustion, fail the dispute).
    ///
    /// The drawn `JurorStake` PDAs are `remaining_accounts` (mut), verified
    /// against the round's juror list + PDA derivation; they are only consumed
    /// on the quorum-met path.
    pub fn finalize_round(ctx: Context<FinalizeRound>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Drawn
                || dispute.state == DisputeState::Commit
                || dispute.state == DisputeState::Reveal,
            AccordError::InvalidState
        );

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= round.reveal_end, AccordError::RoundNotFinalizable);

        let panel = round.juror_count as u32;

        // --- ADR-0021: reveal-quorum threshold gate ---
        // ceil(panel × threshold_bps / 10_000). `panel` is the frozen round-1
        // or appeal panel; the absolute commitment escalates per appeal for
        // free via panel growth (the fraction is fixed).
        let needed = (panel as u64)
            .checked_mul(dispute.terms.reveal_threshold_bps as u64)
            .and_then(|v| v.checked_add(9_999))
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;
        if (round.reveal_count as u64) < needed {
            // Shortfall: no credits, no result. Hand the round to `redraw`.
            dispute.state = DisputeState::RedrawEligible;
            return Ok(());
        }

        // --- Quorum met: tally (ADR-0019 aggregation) + credit + resolve ---
        let winner = match dispute.terms.aggregation {
            Aggregation::Plurality => {
                let mut counts = [0u32; MAX_OPTIONS];
                for i in 0..round.juror_count as usize {
                    let v = round.reveals[i];
                    if v != u8::MAX && (v as usize) < MAX_OPTIONS {
                        counts[v as usize] += 1;
                    }
                }
                (0..dispute.num_options as usize)
                    .max_by_key(|&i| counts[i])
                    .unwrap_or(0) as u8
            }
        };
        round.result = winner;

        // --- ADR-0020: credit fees_earned to each revealer ---
        let sub_key = ctx.accounts.subaccord.key();
        let fee_per_juror = dispute.terms.fee_per_juror;
        let panel_us = round.juror_count as usize;
        if fee_per_juror > 0 {
            require!(
                ctx.remaining_accounts.len() == panel_us,
                AccordError::InvalidPanelSize
            );
            // CU-opt field access — see `crate::layout`.
            const FEES_EARNED_OFFSET: usize = crate::layout::JS_FEES_EARNED_OFF;
            for i in 0..panel_us {
                if round.reveals[i] == u8::MAX {
                    continue; // non-revealer: no credit
                }
                let expected_pda = Pubkey::find_program_address(
                    &[SEED_JUROR_STAKE, sub_key.as_ref(), round.jurors[i].as_ref()],
                    &crate::ID,
                )
                .0;
                let js_info = &ctx.remaining_accounts[i];
                require!(
                    js_info.key == &expected_pda,
                    AccordError::InvalidMembershipProof
                );
                require!(
                    js_info.owner == &crate::ID,
                    AccordError::InvalidMembershipProof
                );
                let mut data = js_info.try_borrow_mut_data()?;
                let existing = u64::from_le_bytes(
                    data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                let new_fees = existing
                    .checked_add(fee_per_juror)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8]
                    .copy_from_slice(&new_fees.to_le_bytes());
            }
            // fee_paid owns ONLY the round-0 filing fee (bean accord-xftx):
            // appeal-round fees live in their AppealBond, not here. Decrement
            // the filer's refundable pool only as round-0 jurors earn. The
            // fees_earned credit above still runs for every round — that is the
            // vault liability (juror compensation), tracked separately from this
            // filer-refund bookkeeping.
            if round.round_idx == 0 {
                dispute.fee_paid = (round.reveal_count as u64)
                    .checked_mul(fee_per_juror)
                    .and_then(|earned| dispute.fee_paid.checked_sub(earned))
                    .ok_or(AccordError::ArithmeticOverflow)?;
            }
        }

        dispute.state = DisputeState::RoundResolved;

        emit!(RoundResolved {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            result: winner,
        });
        Ok(())
    }

    /// Permissionless crank: once the appeal window elapses without an appeal,
    /// writes `final_ruling` and settles the **final round's** economics
    /// (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti, ADR-0020 two-mint). Prior
    /// rounds are settled separately by `settle_round` cranks (≤31 juror
    /// accounts each).
    ///
    /// Settlement is pure ledger accounting (ADR-0020: two pools):
    ///
    /// 1. Determine coherence (revealed vote == final ruling).
    /// 2. Slash each incoherent/non-revealing juror: `α · min_stake` →
    ///    `stake_delta` (stake_token).
    /// 3. Stake pool = slash_total → coherent `stake_delta` (stake_token).
    ///    When no juror is coherent but some revealed, pools go to revealers
    ///    instead (bean accord-aqmw). Zero reveals → surplus trapped.
    /// 4. Fee pool = non-revealer fees + forfeited (no-flip) bonds → coherent
    ///    `fees_earned` (fee_token). (Revealer base fees were credited at
    ///    `finalize_round`; only the forfeited portion redistributes here.)
    /// 5. Decrement `active_draws` for the final round's drawn jurors.
    /// 6. Write `final_ruling`, mark the round settled, transition to `Final`.
    ///
    /// `remaining_accounts` = [juror_stake PDAs (panel)] + [AppealBond PDAs
    /// (one per prior appeal)]. With no appeals this collapses to just juror
    /// stakes (backward-compatible single-round path).
    pub fn finalize_dispute(ctx: Context<FinalizeDispute>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::RoundResolved,
            AccordError::InvalidState
        );

        let mut round = ctx.accounts.round.load_mut()?;
        require!(round.settled == 0, AccordError::RoundAlreadySettled);

        let now = Clock::get()?.unix_timestamp;
        let appeal_deadline = round
            .reveal_end
            .checked_add(dispute.terms.appeal_window as i64)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now >= appeal_deadline, AccordError::AppealWindowOpen);

        let final_ruling = round.result;
        require!(final_ruling != u8::MAX, AccordError::InvalidState);

        let sub_key = ctx.accounts.subaccord.key();
        let dispute_key = dispute.key();
        let panel = round.juror_count as usize;
        let appeal_n = dispute.current_round as usize;
        let fee_per_juror = dispute.terms.fee_per_juror;
        require!(
            ctx.remaining_accounts.len() == panel + appeal_n,
            AccordError::InvalidPanelSize
        );

        // --- Appeal bond forfeiture (ADR-0004) ---
        // `amount` is the total deposit (fee + bond). Derive the fee from the
        // round's panel size, forfeit only the bond portion on no-flip.
        // AppealBond layout: disc(8) + dispute(32) + round_idx(4) + appellant(32)
        // => amount @ 76 (u64), prior_result @ 84 (u8).
        let mut forfeited_total: u64 = 0;
        // AppealBond field access (CU-opt — see `crate::layout`).
        const BOND_ROUND_IDX_OFFSET: usize = crate::layout::AB_ROUND_IDX_OFF;
        const BOND_AMOUNT_OFFSET: usize = crate::layout::AB_AMOUNT_OFF;
        const BOND_PRIOR_OFFSET: usize = crate::layout::AB_PRIOR_OFF;
        for i in 0..appeal_n {
            let expected_pda = Pubkey::find_program_address(
                &[
                    SEED_APPEAL_BOND,
                    dispute_key.as_ref(),
                    &(i as u32).to_le_bytes(),
                ],
                &crate::ID,
            )
            .0;
            let bond_info = &ctx.remaining_accounts[panel + i];
            require!(
                bond_info.key == &expected_pda,
                AccordError::InvalidMembershipProof
            );
            require!(
                bond_info.owner == &crate::ID,
                AccordError::InvalidMembershipProof
            );
            let (bond_portion, prior_result) = {
                let d = bond_info.try_borrow_data()?;
                require!(
                    d.len() >= BOND_PRIOR_OFFSET + 1,
                    AccordError::InvalidMembershipProof
                );
                let total_deposit = u64::from_le_bytes(
                    d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                let round_idx = u32::from_le_bytes(
                    d[BOND_ROUND_IDX_OFFSET..BOND_ROUND_IDX_OFFSET + 4]
                        .try_into()
                        .unwrap(),
                );
                let fee = (panel_size_for_round(round_idx)? as u64)
                    .checked_mul(fee_per_juror)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                (total_deposit.saturating_sub(fee), d[BOND_PRIOR_OFFSET])
            };
            if prior_result == final_ruling {
                forfeited_total = forfeited_total
                    .checked_add(bond_portion)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                let mut d = bond_info.try_borrow_mut_data()?;
                d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
            }
        }

        // --- Settle the final round's jurors (coherence vs final_ruling) ---
        settle_round_accounts(
            &round,
            &dispute.terms,
            &sub_key,
            &ctx.remaining_accounts[..panel],
            final_ruling,
            forfeited_total,
        )?;

        round.settled = 1;

        dispute.final_ruling = final_ruling;
        dispute.finalized_at = now;
        dispute.state = DisputeState::Final;

        emit!(RulingFinalized {
            dispute: dispute_key,
            ruling: final_ruling,
        });
        Ok(())
    }

    /// Permissionless crank: settles a **prior round's** coherence economics
    /// against the finalized ruling (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti).
    ///
    /// Prior-round jurors were left with `active_draws > 0` after the dispute
    /// finalized — this crank releases them. Each call handles one round (≤ 31
    /// Coherence is judged against `dispute.final_ruling`, not the round's own
    /// result: a round-0 juror who voted the option the final panel overturned
    /// is slashed; one who voted the final ruling gets a coherence share.
    /// When no juror is coherent (overturned prior round), pools fall back to
    /// revealers; zero reveals → surplus trapped (bean accord-aqmw).
    /// Revealer base fees were credited at `finalize_round`; non-revealer fees
    /// fold into the coherent fee pool (ADR-0020).
    pub fn settle_round(ctx: Context<SettleRound>, round_idx: u32) -> Result<()> {
        let dispute = &ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Final,
            AccordError::DisputeNotFinal
        );
        require!(
            round_idx < dispute.current_round,
            AccordError::RoundNotSettlable
        );
        let final_ruling = dispute.final_ruling;
        require!(final_ruling != u8::MAX, AccordError::InvalidState);

        let mut round = ctx.accounts.round.load_mut()?;
        require!(round.round_idx == round_idx, AccordError::InvalidState);
        require!(round.settled == 0, AccordError::RoundAlreadySettled);

        let sub_key = ctx.accounts.subaccord.key();
        let panel = round.juror_count as usize;
        require!(
            ctx.remaining_accounts.len() == panel,
            AccordError::InvalidPanelSize
        );

        settle_round_accounts(
            &round,
            &dispute.terms,
            &sub_key,
            &ctx.remaining_accounts,
            final_ruling,
            0, // no appeal bonds in prior-round settlement
        )?;

        round.settled = 1;

        emit!(RoundSettled {
            dispute: dispute.key(),
            round_idx,
        });
        Ok(())
    }

    /// **Permissionless** appeal (ADR-0004): anyone may escalate a resolved
    /// round to a larger panel. The appellant deposits the new round's juror
    /// fee (`N_new · fee_per_juror`) plus an appeal bond (== the new round fee;
    /// forfeited to the final round's coherent jurors if the appeal fails to
    /// flip the prior ruling, returned if it flips). Opens a fresh round at
    /// `2N+1` by incrementing `current_round` and resetting the dispute to
    /// `Created` so the snapshot → draw → vote cycle reruns for the new panel.
    /// Custodies the bond in a per-appeal `AppealBond` PDA.
    ///
    /// `new_evidence_hash` optionally introduces fresh evidence for the new
    /// round (stored at `evidence_hashes[current_round + 1]`); `[0u8; 32]`
    /// sentinel = no new evidence, jurors reuse prior rounds' (milestone
    /// accord-qp7c).
    ///
    /// Gates: `RoundResolved` state, within the appeal window, under the
    /// `max_appeals` cap, and with enough active distinct stakers to fill the
    /// larger panel. Never pausable (ADR-0016) — pausing must not suppress the
    /// right to appeal.
    pub fn appeal(ctx: Context<Appeal>, new_evidence_hash: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require_eq!(
            dispute.subaccord,
            ctx.accounts.subaccord.key(),
            AccordError::SubaccordMismatch
        );
        require!(
            dispute.state == DisputeState::RoundResolved,
            AccordError::InvalidState
        );

        let sub = &mut ctx.accounts.subaccord;
        // Cap: `current_round` is the round just resolved. Appealing opens round
        // `current_round + 1`, i.e. appeal number `current_round + 1`. The
        // number of appeals must not exceed `max_appeals`. Ugly 6: the cap is
        // the filing-time value (frozen on the dispute).
        require!(
            dispute.current_round < u32::from(dispute.terms.max_appeals),
            AccordError::MaxAppealsReached
        );

        let round = ctx.accounts.round.load()?;
        let prior_result = round.result;
        require!(prior_result != u8::MAX, AccordError::InvalidState);

        let now = Clock::get()?.unix_timestamp;
        let appeal_deadline = round
            .reveal_end
            .checked_add(dispute.terms.appeal_window as i64)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now < appeal_deadline, AccordError::AppealWindowClosed);

        // New panel = 2N+1 (closed form `(J+1)·2^k − 1`, capped at MAX_JURORS).
        // Ugly 6: panel base + fee are filing-time (frozen on the dispute).
        let new_round = dispute
            .current_round
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let panel_new = panel_size_for_round(new_round)?;
        require!(
            sub.staker_count >= panel_new,
            AccordError::InsufficientJurors
        );

        // Exponential cost: new-round fee + appeal bond (bond == new-round fee).
        let fee_new = (panel_new as u64)
            .checked_mul(dispute.terms.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let bond = fee_new;
        let total = fee_new
            .checked_add(bond)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Custody fee + bond: appellant ATA -> Subaccord PDA fee_vault (ADR-0020).
        let before = ctx.accounts.fee_vault.amount;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.appellant_token_account.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.appellant.to_account_info(),
                },
            ),
            total,
        )?;
        ctx.accounts.fee_vault.reload()?;
        let after = ctx.accounts.fee_vault.amount;
        let delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;
        sub.fee_vault_deposited = sub
            .fee_vault_deposited
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Record the appeal bond in its own PDA for settlement. `prior_result`
        // captures the ruling the appellant seeks to flip (the just-resolved
        // round's winner); flip detection at `finalize_dispute` compares it
        // against the final ruling.
        let bond_acc = &mut ctx.accounts.appeal_bond;
        bond_acc.dispute = dispute.key();
        bond_acc.round_idx = new_round;
        bond_acc.appellant = ctx.accounts.appellant.key();
        bond_acc.amount = total;
        bond_acc.prior_result = prior_result;
        bond_acc.bump = ctx.bumps.appeal_bond;

        // Ownership boundary (bean accord-xftx): the appeal fee lives ONLY in
        // `AppealBond.amount` (fee + bond), never in `dispute.fee_paid`. The
        // filer's `fee_paid` owns exclusively the round-0 filing fee; folding
        // the appeal fee in here caused a double-refund on cancel (filer via
        // fee_paid, appellant via the bond — same fee, two claimants).

        // Open the new round: bump `current_round` and reset to `Created` so the
        // snapshot → draw → vote cycle reruns for the larger panel.  Stamp
        // `filed_at = now` so the pre-draw cancel timeout starts fresh — without
        // this, the original filing timestamp (long past) makes the dispute
        // immediately cancelable (REVIEW #2).
        dispute.current_round = new_round;
        dispute.state = DisputeState::Created;
        dispute.filed_at = now;
        // Per-round evidence (milestone accord-qp7c): stash the appellant's
        // new evidence at the new round's slot. `[0u8; 32]` sentinel = no new
        // evidence this round (jurors reuse prior rounds'). The max_appeals
        // gate above guarantees `new_round <= MAX_APPEALS`, so the index is
        // in-bounds and the slot is virgin (sequential per-round writes).
        dispute.evidence_hashes[new_round as usize] = new_evidence_hash;

        emit!(Appealed {
            dispute: dispute.key(),
            new_round_idx: new_round,
            appellant: ctx.accounts.appellant.key(),
            deposit: total,
        });
        Ok(())
    }

    /// Permissionless crank that returns the appeal bond to its appellant once
    /// the dispute is terminal (Final or Failed). The appellant ALWAYS recovers
    /// only the bond — never the appeal fee (bean accord-xftx): on Final a
    /// flipped bond is returned (a no-flip bond was already zeroed by
    /// `finalize_dispute`); on Failed the bond is returned regardless (the
    /// appeal fee is owned by the round's jurors or trapped in the vault).
    /// `round_idx` selects which appeal's bond to claim (the round that was
    /// current when the appeal was filed). Verifies the `AppealBond` belongs to
    /// the destination ATA's owner, PDA-signs the vault → ATA refund, then
    /// zeroes the bond (idempotent).
    pub fn claim_appeal_refund(ctx: Context<ClaimAppealRefund>, round_idx: u32) -> Result<()> {
        let _ = round_idx; // consumed by the `#[instruction]` PDA seeds
        let dispute = &ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Final || dispute.state == DisputeState::Failed,
            AccordError::InvalidState
        );

        let bond_acc = &ctx.accounts.appeal_bond;
        require!(
            bond_acc.appellant == ctx.accounts.claimant_token_account.owner,
            AccordError::InvalidMembershipProof
        );

        // `amount` is the total deposit (appeal fee + bond). The appellant
        // always recovers ONLY the bond — never the appeal fee — regardless of
        // terminal state (bean accord-xftx). The appeal fee is owned by the
        // round's jurors (credited as fees_earned if the round resolved) or
        // trapped in the vault if it never resolved; it is never the
        // appellant's to reclaim. On Final a no-flip bond was already zeroed
        // by finalize_dispute, so this yields 0 → InvalidAmount (idempotent
        // guard against claiming a forfeited bond).
        let fee = (panel_size_for_round(bond_acc.round_idx)? as u64)
            .checked_mul(dispute.terms.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let refund = bond_acc.amount.saturating_sub(fee);
        require!(refund > 0, AccordError::InvalidAmount);

        let sub = &mut ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.risk_type.as_ref(),
            &bump,
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.claimant_token_account.to_account_info(),
                    authority: sub.to_account_info(),
                },
                &[signer_seeds],
            ),
            refund,
        )?;

        // Parallel vault ledger (bean accord-fdad): track the bond refund out.
        sub.fee_vault_withdrawn = sub
            .fee_vault_withdrawn
            .checked_add(refund)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Mark claimed (idempotent): no double-refund on re-invocation.
        ctx.accounts.appeal_bond.amount = 0;

        Ok(())
    }

    /// Permissionless liveness-escape crank (CONCEPT-REVIEW Ugly 4). If a
    /// dispute has stalled past its per-stage timeout, any cranker may cancel
    /// it: the filer's round-1 fee is refunded from the vault, the current
    /// round's drawn jurors have their `active_draws` released (post-draw
    /// stalls only), and the dispute transitions to the terminal `Failed`
    /// state.
    ///
    /// Two timeout windows (immutable program constants, so they are frozen
    /// for the dispute's life trivially — stronger than a `CaseTerms` field):
    /// - **Pre-draw** (`Created`): cancelable once
    ///   `now > filed_at + PRE_DRAW_CANCEL_TIMEOUT_SECS` — covers a VRF oracle
    /// - **Post-draw** (`Drawn`/`Commit`/`Reveal`/`RoundResolved`): cancelable
    ///   once `now > round.reveal_end + terms.appeal_window +
    ///   POST_DRAW_CANCEL_GRACE_SECS` — covers a round no cranker ever
    ///   finalizes. The current `Round` is `remaining_accounts[0]`; the
    ///   drawn `JurorStake` PDAs follow (`[1..=panel]`).
    ///
    /// `Final`/`Closed`/`Failed` are terminal and revert. The filer refund is
    /// exactly `dispute.fee_paid` (C-1: the per-dispute fee pool — NOT the
    /// shared vault balance; the fee_vault is one ATA for the entire
    /// Subaccord). Appeal bonds stay claimable via `claim_appeal_refund`.
    pub fn cancel_dispute(ctx: Context<CancelDispute>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        let now = Clock::get()?.unix_timestamp;
        let dispute_key = dispute.key();
        let filer = dispute.filer;
        let state = dispute.state;
        let current_round = dispute.current_round;
        let sub_key = ctx.accounts.subaccord.key();
        let slash_per_juror = (dispute.terms.alpha_bps as u64)
            .checked_mul(dispute.terms.min_stake)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;

        let post_draw = matches!(
            state,
            DisputeState::Drawn
                | DisputeState::Commit
                | DisputeState::Reveal
                | DisputeState::RoundResolved
        );

        if post_draw {
            // remaining_accounts = [current Round, ...JurorStake PDAs,
            //   ...prior Round PDAs + their JurorStake PDAs, ...AppealBond PDAs].
            require!(
                !ctx.remaining_accounts.is_empty(),
                AccordError::InvalidState
            );
            let round_info = &ctx.remaining_accounts[0];
            let expected_round = Pubkey::find_program_address(
                &[
                    SEED_ROUND,
                    dispute_key.as_ref(),
                    &current_round.to_le_bytes(),
                ],
                &crate::ID,
            )
            .0;
            require!(
                round_info.key == &expected_round,
                AccordError::InvalidMembershipProof
            );

            // Load the zero-copy Round to read its deadline + juror list.
            let (juror_count, jurors) = {
                let loader = AccountLoader::<Round>::try_from(round_info)?;
                let round = loader.load()?;
                let deadline = round
                    .reveal_end
                    .checked_add(dispute.terms.appeal_window as i64)
                    .and_then(|v| v.checked_add(POST_DRAW_CANCEL_GRACE_SECS))
                    .ok_or(AccordError::ArithmeticOverflow)?;
                require!(now > deadline, AccordError::CancelTooEarly);
                let count = round.juror_count as usize;
                (count, round.jurors[..count].to_vec())
            };

            // Release active_draws for every drawn juror in the current round.
            const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF; // CU-opt — see crate::layout
            require!(
                1 + juror_count <= ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );
            for (i, acct_info) in ctx.remaining_accounts[1..=juror_count].iter().enumerate() {
                let expected_pda = Pubkey::find_program_address(
                    &[SEED_JUROR_STAKE, sub_key.as_ref(), jurors[i].as_ref()],
                    &crate::ID,
                )
                .0;
                require!(
                    acct_info.key == &expected_pda,
                    AccordError::InvalidMembershipProof
                );
                require!(
                    acct_info.owner == &crate::ID,
                    AccordError::InvalidMembershipProof
                );
                let mut data = acct_info.try_borrow_mut_data()?;
                let draws = u32::from_le_bytes(
                    data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                        .try_into()
                        .unwrap(),
                );
                let new_draws = draws.saturating_sub(1);
                data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                    .copy_from_slice(&new_draws.to_le_bytes());
                // Release slash reserve for this dispute.
                const SLASH_RESERVE_OFF: usize = crate::layout::JS_SLASH_RESERVE_OFF;
                if data.len() >= SLASH_RESERVE_OFF + 8 {
                    let reserve = u64::from_le_bytes(
                        data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                            .try_into()
                            .unwrap(),
                    );
                    let new_reserve = reserve.saturating_sub(slash_per_juror);
                    data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                        .copy_from_slice(&new_reserve.to_le_bytes());
                }
            }

            // Release prior-round jurors.
            let rounds_end = release_prior_rounds(
                &ctx.remaining_accounts,
                &dispute_key,
                &sub_key,
                1 + juror_count,
                current_round,
                slash_per_juror,
            )?;

            // Strict accounting: rounds + bonds must exactly fill remaining_accounts.
            let appeal_n = current_round as usize;
            require!(
                rounds_end + appeal_n == ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );

            // C-1: validate appeal-bond PDAs (needed for later
            // claim_appeal_refund). Their total is NOT used for the filer refund
            // — the fee_vault is shared across all disputes; using its balance
            // would steal other disputes' deposits.
            read_bond_amounts(&ctx.remaining_accounts, &dispute_key, rounds_end, appeal_n)?;
        } else {
            // Pre-draw stall (Created). Terminal states are rejected here.
            require!(state == DisputeState::Created, AccordError::InvalidState);
            let deadline = dispute
                .filed_at
                .checked_add(PRE_DRAW_CANCEL_TIMEOUT_SECS)
                .ok_or(AccordError::ArithmeticOverflow)?;
            require!(now > deadline, AccordError::CancelTooEarly);

            // REVIEW #3: probe for a partially-drawn current round. If any
            // seats landed before the stall, release those jurors too.
            let mut idx = 0;
            let current_round_pda = Pubkey::find_program_address(
                &[
                    SEED_ROUND,
                    dispute_key.as_ref(),
                    &current_round.to_le_bytes(),
                ],
                &crate::ID,
            )
            .0;
            if !ctx.remaining_accounts.is_empty()
                && ctx.remaining_accounts[0].key == &current_round_pda
            {
                const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
                let (juror_count, jurors) = {
                    let loader = AccountLoader::<Round>::try_from(&ctx.remaining_accounts[0])?;
                    let round = loader.load()?;
                    let c = round.juror_count as usize;
                    (c, round.jurors[..c].to_vec())
                };
                require!(
                    1 + juror_count <= ctx.remaining_accounts.len(),
                    AccordError::InvalidPanelSize
                );
                for (j, juror) in jurors.iter().enumerate() {
                    let acct_info = &ctx.remaining_accounts[1 + j];
                    let expected_pda = Pubkey::find_program_address(
                        &[SEED_JUROR_STAKE, sub_key.as_ref(), juror.as_ref()],
                        &crate::ID,
                    )
                    .0;
                    require!(
                        acct_info.key == &expected_pda,
                        AccordError::InvalidMembershipProof
                    );
                    require!(
                        acct_info.owner == &crate::ID,
                        AccordError::InvalidMembershipProof
                    );
                    let mut data = acct_info.try_borrow_mut_data()?;
                    let draws = u32::from_le_bytes(
                        data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                            .try_into()
                            .unwrap(),
                    );
                    data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                        .copy_from_slice(&draws.saturating_sub(1).to_le_bytes());
                    // Release slash reserve for this dispute.
                    const SLASH_RESERVE_OFF: usize = crate::layout::JS_SLASH_RESERVE_OFF;
                    if data.len() >= SLASH_RESERVE_OFF + 8 {
                        let reserve = u64::from_le_bytes(
                            data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                                .try_into()
                                .unwrap(),
                        );
                        let new_reserve = reserve.saturating_sub(slash_per_juror);
                        data[SLASH_RESERVE_OFF..SLASH_RESERVE_OFF + 8]
                            .copy_from_slice(&new_reserve.to_le_bytes());
                    }
                }
                idx = 1 + juror_count;
            }

            // Release prior-round jurors (appeal rounds that completed but
            // were never settled).
            let rounds_end = release_prior_rounds(
                &ctx.remaining_accounts,
                &dispute_key,
                &sub_key,
                idx,
                current_round,
                slash_per_juror,
            )?;

            // Strict accounting: rounds + bonds must exactly fill remaining_accounts.
            let appeal_n = current_round as usize;
            require!(
                rounds_end + appeal_n == ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );

            // C-1: validate appeal-bond PDAs (same as post-draw branch).
            read_bond_amounts(&ctx.remaining_accounts, &dispute_key, rounds_end, appeal_n)?;
        }

        // --- Refund: per-dispute fee_paid only (C-1). The fee_vault is one
        // shared ATA for the entire Subaccord; using vault_balance would drain
        // other disputes' deposits. Appeal bonds stay claimable via
        // claim_appeal_refund — not swept here. ---
        let filer_fee = dispute.fee_paid;
        dispute.fee_paid = 0;

        let sub = &mut ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.risk_type.as_ref(),
            &bump,
        ];
        if filer_fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.fee_vault.to_account_info(),
                        to: ctx.accounts.filer_token_account.to_account_info(),
                        authority: sub.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                filer_fee,
            )?;
        }

        // Parallel vault ledger (bean accord-fdad): track the filer refund out.
        if filer_fee > 0 {
            sub.fee_vault_withdrawn = sub
                .fee_vault_withdrawn
                .checked_add(filer_fee)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }

        dispute.state = DisputeState::Failed;

        emit!(DisputeCancelled {
            dispute: dispute_key,
            filer,
            refund: filer_fee,
        });
        Ok(())
    }

    /// Read-only: returns the dispute's `final_ruling`. The Arbitrable calls
    /// this via CPI to lazily read the outcome. Returns `None` until the
    /// dispute reaches `Final` (stored on-chain as the `u8::MAX` sentinel).
    pub fn get_ruling(ctx: Context<GetRuling>) -> Result<Option<u8>> {
        let r = ctx.accounts.dispute.final_ruling;
        Ok((r != u8::MAX).then_some(r))
    }

    /// Withdraw aggregate earned fees (ADR-0020). Per-juror: pulls earned fees
    /// from the Subaccord's `fee_vault` → the juror's `fee_token` ATA. No
    /// `active_draws` gate, no timelock — earned fees are not at-risk capital.
    ///
    /// Bean accord-fdad: no vault-balance cap. The parallel-ledger invariant
    /// (`fee_vault.amount == fee_deposited − fee_withdrawn`, see Subaccord)
    /// guarantees the fee-side net always covers all unwithdrawn `fees_earned`
    /// — every fee credit was preceded by its backing deposit, and refunds
    /// only return unconsumed portions. The SPL transfer is the last-resort
    /// assertion: if it ever fails, it signals a missed accumulator touchpoint
    /// (a bug), not legitimate insolvency.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        let js = &mut ctx.accounts.juror_stake;
        let amt = js.fees_earned;
        require!(amt > 0, AccordError::NoFeesEarned);
        js.fees_earned = 0;

        let sub = &mut ctx.accounts.subaccord;
        sub.fee_vault_withdrawn = sub
            .fee_vault_withdrawn
            .checked_add(amt)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.risk_type.as_ref(),
            &bump,
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.juror_fee_token_account.to_account_info(),
                    authority: sub.to_account_info(),
                },
                &[signer_seeds],
            ),
            amt,
        )?;

        emit!(FeesWithdrawn {
            subaccord: sub.key(),
            juror: ctx.accounts.juror.key(),
            amount: amt,
        });
        Ok(())
    }

    /// Permissionless crank (ADR-0021): reconvenes a shortfall round. Callable
    /// only from `RedrawEligible`. `draw_attempt` is orthogonal to `round_idx` —
    /// bumping it changes only the sortition seed (fresh seats), never the panel
    /// size or the appeal budget.
    ///
    /// - **Redraw** (`draw_attempt + 1 < max_draw_attempts`): slashes no-shows
    ///   into `stake_delta` (pending, not `staked` — keeps the frozen-root
    ///   inflation guard passing), releases every drawn juror's `active_draws`
    ///   + `slash_reserve` for this failed round, bumps `round.draw_attempt`,
    ///   clears the round, and re-opens `Created` so `draw_seat` fills fresh
    ///   seats at the same panel size.
    /// - **Fail on exhaustion** (`draw_attempt + 1 >= max_draw_attempts`): same
    ///   slash/release for the current round (+ prior appeal rounds'
    ///   `active_draws` via `release_prior_rounds`), refunds the filer's
    ///   remaining `dispute.fee_paid` (per-dispute, vault-safe), and transitions
    ///   to terminal `Failed`. No-shows' accumulated slashes stand; outstanding
    ///   appeal bonds remain claimable via `claim_appeal_refund`.
    ///
    /// `remaining_accounts` = [current-round `JurorStake` PDAs (panel)]; on the
    /// Fail branch additionally [...prior `Round` PDAs + their `JurorStake`
    /// PDAs] + [...`AppealBond` PDAs] (same layout as `cancel_dispute`).
    pub fn redraw(ctx: Context<Redraw>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::RedrawEligible,
            AccordError::NotRedrawEligible
        );
        require_eq!(
            dispute.subaccord,
            ctx.accounts.subaccord.key(),
            AccordError::SubaccordMismatch
        );

        let dispute_key = dispute.key();
        let sub_key = ctx.accounts.subaccord.key();
        let terms = dispute.terms;
        let slash_per_juror = (terms.alpha_bps as u64)
            .checked_mul(terms.min_stake)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;

        let mut round = ctx.accounts.round.load_mut()?;
        let round_idx = round.round_idx;
        let panel = round.juror_count as usize;
        require!(panel > 0, AccordError::InvalidState);
        require!(
            ctx.remaining_accounts.len() >= panel,
            AccordError::InvalidPanelSize
        );

        let new_draw_attempt = round
            .draw_attempt
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let exhausted = new_draw_attempt >= terms.max_draw_attempts as u32;

        // --- Pass 1: slash no-shows; release active_draws + slash_reserve for
        //     every drawn juror of the failed round. ---
        // CU-opt field access — see `crate::layout`.
        const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
        const STAKE_DELTA_OFFSET: usize = crate::layout::JS_STAKE_DELTA_OFF;
        const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
        for i in 0..panel {
            let expected_pda = Pubkey::find_program_address(
                &[SEED_JUROR_STAKE, sub_key.as_ref(), round.jurors[i].as_ref()],
                &crate::ID,
            )
            .0;
            let acct_info = &ctx.remaining_accounts[i];
            require!(
                acct_info.key == &expected_pda,
                AccordError::InvalidMembershipProof
            );
            require!(
                acct_info.owner == &crate::ID,
                AccordError::InvalidMembershipProof
            );
            let no_show = round.reveals[i] == u8::MAX;
            let mut data = acct_info.try_borrow_mut_data()?;
            // active_draws -= 1: every drawn juror is released from this round.
            let draws = u32::from_le_bytes(
                data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                    .try_into()
                    .unwrap(),
            );
            data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                .copy_from_slice(&draws.saturating_sub(1).to_le_bytes());
            // Release this draw's slash reservation (reserved at `draw_seat`).
            let reserve = u64::from_le_bytes(
                data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                .copy_from_slice(&reserve.saturating_sub(slash_per_juror).to_le_bytes());
            // No-shows only: realize the slash into `stake_delta` (pending).
            if no_show {
                let delta = i64::from_le_bytes(
                    data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8]
                    .copy_from_slice(&delta.saturating_sub(slash_per_juror as i64).to_le_bytes());
            }
        }

        if exhausted {
            // --- Fail branch: release prior appeal rounds + refund filer → Failed.
            let rounds_end = release_prior_rounds(
                &ctx.remaining_accounts,
                &dispute_key,
                &sub_key,
                panel,
                round_idx,
                slash_per_juror,
            )?;
            // Strict accounting: prior rounds + this dispute's AppealBond PDAs
            // must fill the rest (same layout as `cancel_dispute`). Bonds are
            // NOT refunded here — they stay claimable via `claim_appeal_refund`.
            let appeal_n = round_idx as usize;
            require!(
                rounds_end + appeal_n == ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );

            // ADR-0021: refund the filer's remaining fee pool (per-dispute
            // `fee_paid` — vault-safe for the shared Subaccord fee_vault; the
            // ADR-0020 invariant guarantees `fee_vault.balance ≥ fee_paid`).
            let refund = dispute.fee_paid;
            dispute.fee_paid = 0;
            let sub = &mut ctx.accounts.subaccord;
            let bump = [sub.bump];
            let signer_seeds = &[
                SEED_SUBACCORD,
                sub.creator.as_ref(),
                sub.risk_type.as_ref(),
                &bump,
            ];
            if refund > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.fee_vault.to_account_info(),
                            to: ctx.accounts.filer_token_account.to_account_info(),
                            authority: sub.to_account_info(),
                        },
                        &[signer_seeds],
                    ),
                    refund,
                )?;
            }

            // Parallel vault ledger (bean accord-fdad): track the filer refund.
            if refund > 0 {
                sub.fee_vault_withdrawn = sub
                    .fee_vault_withdrawn
                    .checked_add(refund)
                    .ok_or(AccordError::ArithmeticOverflow)?;
            }

            round.draw_attempt = new_draw_attempt;
            dispute.state = DisputeState::Failed;

            emit!(DisputeFailedShortfall {
                dispute: dispute_key,
                filer: dispute.filer,
                draw_attempt: new_draw_attempt,
                refund,
            });
        } else {
            // --- Redraw branch: clear the round, re-open Created for fresh seats.
            require!(
                ctx.remaining_accounts.len() == panel,
                AccordError::InvalidPanelSize
            );
            round.draw_attempt = new_draw_attempt;
            round.juror_count = 0;
            round.commit_count = 0;
            round.reveal_count = 0;
            round.result = u8::MAX;
            round.review_end = 0;
            round.commit_end = 0;
            round.reveal_end = 0;
            round.jurors = [Pubkey::default(); MAX_JURORS];
            round.commits = [[0u8; 32]; MAX_JURORS];
            round.reveals = [u8::MAX; MAX_JURORS];
            round.seat_prefix = [0u64; MAX_JURORS];
            round.seat_stake = [0u64; MAX_JURORS];
            // `dispute`/`round_idx`/`bump`/`settled` preserved; seed entropy
            // now differs via the bumped `draw_attempt`.
            dispute.state = DisputeState::Created;

            emit!(Redrawn {
                dispute: dispute_key,
                round_idx,
                draw_attempt: new_draw_attempt,
            });
        }
        Ok(())
    }
}

/// Validate a single `UpdatePayload` variant against the same domain bounds
/// enforced at `create_subaccord` (H-1 / shared-base §29.3: validate in every
/// write path). Called from both `propose_subaccord_update` (early rejection)
/// and `execute_subaccord_update` (defense-in-depth).
fn validate_update_payload(payload: &UpdatePayload) -> Result<()> {
    match payload {
        UpdatePayload::AlphaBps(v) => require!(*v <= 10_000, AccordError::InvalidThreshold),
        UpdatePayload::MaxAppeals(v) => {
            require!(
                *v as usize <= MAX_APPEALS,
                AccordError::MaxAppealsLimitExceeded
            )
        }
        UpdatePayload::AppealWindow(v) => {
            require!(
                *v >= MIN_APPEAL_WINDOW_SECS,
                AccordError::AppealWindowTooShort
            )
        }
        UpdatePayload::MinStake(v) => require!(*v > 0, AccordError::InvalidAmount),
        UpdatePayload::FeePerJuror(v) => {
            (INITIAL_NUM_JURORS as u64)
                .checked_mul(*v)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }
        // Windows must be > 0 to keep the state machine reachable (§29.2).
        UpdatePayload::ReviewWindow(v) => require!(*v > 0, AccordError::InvalidAmount),
        UpdatePayload::CommitWindow(v) => require!(*v > 0, AccordError::InvalidAmount),
        UpdatePayload::RevealWindow(v) => require!(*v > 0, AccordError::InvalidAmount),
        // Authority / EvidenceOperator are arbitrary Pubkeys — no domain bound.
        UpdatePayload::Authority(_) | UpdatePayload::EvidenceOperator(_) => {}
    }
    Ok(())
}

// --- Accumulator MST helpers (ADR-0012) ---------------------------------------

/// Leaf hash: `H(juror || stake_le)`.
fn mst_leaf_hash(juror: &Pubkey, stake: u64) -> [u8; 32] {
    use solana_program::hash::hashv;
    hashv(&[juror.as_ref(), &stake.to_le_bytes()]).to_bytes()
}

/// Internal node hash: `H(left_hash || left_sum || right_hash || right_sum)`.
/// Sums are bound into the hash (CONCEPT-REVIEW Bad 5 fixed by construction).
fn mst_node_hash(
    left_hash: &[u8; 32],
    left_sum: u64,
    right_hash: &[u8; 32],
    right_sum: u64,
) -> [u8; 32] {
    use solana_program::hash::hashv;
    hashv(&[
        left_hash,
        &left_sum.to_le_bytes(),
        right_hash,
        &right_sum.to_le_bytes(),
    ])
    .to_bytes()
}

/// Root hash of an all-zero tree at `depth` (every leaf = `(default, 0)`, every
/// sum = 0). The initial accumulator state before any stake lands.
fn empty_tree_root(depth: u8) -> [u8; 32] {
    let mut h = mst_leaf_hash(&Pubkey::default(), 0);
    for _ in 0..depth {
        h = mst_node_hash(&h, 0, &h, 0);
    }
    h
}

/// Verify the leaf `(old_juror, old_stake)` at `index` authenticates against the
/// stored `(stored_root, stored_sum)`, then recompute the root for a new leaf
/// `(new_juror, new_stake)`. Used by `stake`/`unstake` to advance the canonical
/// accumulator root on every verified update. Returns
/// `Err(InvalidMerklePath)` if the supplied path does not authenticate.
///
/// `old_juror != new_juror` only on a juror's first stake (the assigned slot
/// transitions from the all-zero leaf to the real juror); otherwise both are
/// the juror's identity and only the stake changes.
#[allow(clippy::too_many_arguments)]
fn verify_and_recompute(
    old_juror: &Pubkey,
    old_stake: u64,
    new_juror: &Pubkey,
    new_stake: u64,
    index: u32,
    path: &[MSTNode],
    stored_root: &[u8; 32],
    stored_sum: u64,
) -> Result<([u8; 32], u64)> {
    // ponytail: 8 args are intrinsic to verify-then-recompute (old/new juror+stake,
    // position, path, stored root+sum). A params struct is ceremony for one caller.
    // --- Verify: walk the supplied path from the old leaf to the root. ---
    let mut acc_hash = mst_leaf_hash(old_juror, old_stake);
    let mut acc_sum = old_stake;
    for (level, sib) in path.iter().enumerate() {
        if level >= 31 {
            return Err(AccordError::InvalidMerklePath.into());
        }
        let leaf_is_left = (index >> level) & 1 == 0;
        let (lh, ls, rh, rs) = if leaf_is_left {
            (acc_hash, acc_sum, sib.sibling_hash, sib.sibling_sum)
        } else {
            (sib.sibling_hash, sib.sibling_sum, acc_hash, acc_sum)
        };
        acc_hash = mst_node_hash(&lh, ls, &rh, rs);
        acc_sum = ls.checked_add(rs).ok_or(AccordError::ArithmeticOverflow)?;
    }
    if &acc_hash != stored_root || acc_sum != stored_sum {
        return Err(AccordError::InvalidMerklePath.into());
    }

    // --- Recompute: walk the same path from the new leaf to a new root. ---
    let mut new_hash = mst_leaf_hash(new_juror, new_stake);
    let mut new_sum = new_stake;
    for (level, sib) in path.iter().enumerate() {
        let leaf_is_left = (index >> level) & 1 == 0;
        let (lh, ls, rh, rs) = if leaf_is_left {
            (new_hash, new_sum, sib.sibling_hash, sib.sibling_sum)
        } else {
            (sib.sibling_hash, sib.sibling_sum, new_hash, new_sum)
        };
        new_hash = mst_node_hash(&lh, ls, &rh, rs);
        new_sum = ls.checked_add(rs).ok_or(AccordError::ArithmeticOverflow)?;
    }
    Ok((new_hash, new_sum))
}

/// Verify `leaf` at `index` authenticates against `(root_hash, root_sum)` and
/// return the cumulative-from-left prefix (total stake of all leaves to the
/// left of `index`), reconstructed from the authenticated sibling sums. The
/// leaf's sortition range is `[prefix, prefix + stake)`. Used by `draw_seat`.
fn verify_membership_and_prefix(
    leaf: &LeafClaim,
    index: u32,
    path: &[MSTNode],
    root_hash: &[u8; 32],
    root_sum: u64,
) -> Result<u64> {
    let mut acc_hash = mst_leaf_hash(&leaf.juror, leaf.stake);
    let mut acc_sum = leaf.stake;
    let mut prefix: u64 = 0;
    for (level, sib) in path.iter().enumerate() {
        if level >= 31 {
            return Err(AccordError::InvalidMembershipProof.into());
        }
        let leaf_is_left = (index >> level) & 1 == 0;
        let (lh, ls, rh, rs) = if leaf_is_left {
            (acc_hash, acc_sum, sib.sibling_hash, sib.sibling_sum)
        } else {
            // Leaf is the right child → the left sibling's subtree is entirely
            // to the left of the leaf, so its authenticated sum feeds the prefix.
            prefix = prefix
                .checked_add(sib.sibling_sum)
                .ok_or(AccordError::ArithmeticOverflow)?;
            (sib.sibling_hash, sib.sibling_sum, acc_hash, acc_sum)
        };
        acc_hash = mst_node_hash(&lh, ls, &rh, rs);
        acc_sum = ls.checked_add(rs).ok_or(AccordError::ArithmeticOverflow)?;
    }
    if &acc_hash != root_hash || acc_sum != root_sum {
        return Err(AccordError::InvalidMembershipProof.into());
    }
    Ok(prefix)
}

/// Required panel size for a given round index. The round-1 panel is the fixed
/// `INITIAL_NUM_JURORS` (=3, ADR-0019); the appeal ladder grows it via
/// `N_{k+1} = 2·N_k + 1` (closed form `(J+1)·2^k − 1`), so round 0 = 3,
/// round 1 = 7, round 2 = 15, round 3 = 31 — capped at `MAX_JURORS` (31).
fn panel_size_for_round(round_idx: u32) -> Result<u32> {
    if round_idx >= 31 {
        return Err(AccordError::ArithmeticOverflow.into());
    }
    let factor = 1u32
        .checked_shl(round_idx)
        .ok_or(AccordError::ArithmeticOverflow)?;
    let panel = INITIAL_NUM_JURORS
        .checked_add(1)
        .ok_or(AccordError::ArithmeticOverflow)?
        .checked_mul(factor)
        .ok_or(AccordError::ArithmeticOverflow)?
        .checked_sub(1)
        .ok_or(AccordError::ArithmeticOverflow)?;
    Ok(panel.min(MAX_JURORS as u32))
}

/// Read and sum AppealBond `amount` fields from `accounts[start..start+n]`.
/// Verifies each PDA against `["bond", dispute_key, i]`. Used by
/// `cancel_dispute` to compute the vault reserve for appeal refunds.
fn read_bond_amounts<'info>(
    accounts: &'info [AccountInfo<'info>],
    dispute_key: &Pubkey,
    start: usize,
    n: usize,
) -> Result<u64> {
    if n == 0 {
        return Ok(0);
    }
    const BOND_AMOUNT_OFFSET: usize = crate::layout::AB_AMOUNT_OFF; // CU-opt — see crate::layout
    let mut total: u64 = 0;
    for i in 0..n {
        let expected_pda = Pubkey::find_program_address(
            &[
                SEED_APPEAL_BOND,
                dispute_key.as_ref(),
                &(i as u32).to_le_bytes(),
            ],
            &crate::ID,
        )
        .0;
        let bond_info = &accounts[start + i];
        require!(
            bond_info.key == &expected_pda,
            AccordError::InvalidMembershipProof
        );
        require!(
            bond_info.owner == &crate::ID,
            AccordError::InvalidMembershipProof
        );
        let d = bond_info.try_borrow_data()?;
        require!(
            d.len() >= BOND_AMOUNT_OFFSET + 8,
            AccordError::InvalidMembershipProof
        );
        let amt = u64::from_le_bytes(
            d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8]
                .try_into()
                .unwrap(),
        );
        total = total
            .checked_add(amt)
            .ok_or(AccordError::ArithmeticOverflow)?;
    }
    Ok(total)
}

/// Release `active_draws` for every juror in every prior round
/// (`0..current_round`). Used by `cancel_dispute` so that appeal-escalated
/// disputes that stall don't permanently lock prior-round jurors
/// (REVIEW #2).  Each round's `JurorStake` PDAs must follow the `Round` PDA
/// in `remaining_accounts`, laid out sequentially starting at `start`.
/// Returns the index past the last consumed account.
fn release_prior_rounds<'info>(
    accounts: &'info [AccountInfo<'info>],
    dispute_key: &Pubkey,
    sub_key: &Pubkey,
    start: usize,
    current_round: u32,
    slash_per_juror: u64,
) -> Result<usize> {
    if current_round == 0 {
        return Ok(start);
    }
    let mut idx = start;
    // CU-opt field access — see `crate::layout`.
    const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
    const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
    for round_idx in 0..current_round {
        require!(idx < accounts.len(), AccordError::InvalidState);
        let round_info = &accounts[idx];
        let expected = Pubkey::find_program_address(
            &[SEED_ROUND, dispute_key.as_ref(), &round_idx.to_le_bytes()],
            &crate::ID,
        )
        .0;
        require!(
            round_info.key == &expected,
            AccordError::InvalidMembershipProof
        );

        let jurors: Vec<Pubkey> = {
            let loader = AccountLoader::<Round>::try_from(round_info)?;
            let round = loader.load()?;
            round.jurors[..round.juror_count as usize].to_vec()
        };
        let count = jurors.len();
        idx += 1;
        require!(idx + count <= accounts.len(), AccordError::InvalidPanelSize);

        for j in 0..count {
            let acct_info = &accounts[idx + j];
            let expected_pda = Pubkey::find_program_address(
                &[SEED_JUROR_STAKE, sub_key.as_ref(), jurors[j].as_ref()],
                &crate::ID,
            )
            .0;
            require!(
                acct_info.key == &expected_pda,
                AccordError::InvalidMembershipProof
            );
            require!(
                acct_info.owner == &crate::ID,
                AccordError::InvalidMembershipProof
            );
            let mut data = acct_info.try_borrow_mut_data()?;
            let draws = u32::from_le_bytes(
                data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                    .try_into()
                    .unwrap(),
            );
            let new_draws = draws.saturating_sub(1);
            data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                .copy_from_slice(&new_draws.to_le_bytes());
            // Release slash reserve for this dispute.
            if data.len() >= SLASH_RESERVE_OFFSET + 8 {
                let reserve = u64::from_le_bytes(
                    data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                let new_reserve = reserve.saturating_sub(slash_per_juror);
                data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                    .copy_from_slice(&new_reserve.to_le_bytes());
            }
        }
        idx += count;
    }
    Ok(idx)
}

/// Shared per-round coherence settlement (CONCEPT-REVIEW Ugly 5 / accord-r6ti,
/// ADR-0020 two-mint rework).
///
/// Judges every drawn juror against `final_ruling` (NOT the round's own result),
/// slashes incoherent/non-revealing jurors by `α·min_stake`, and redistributes
/// two distinct pools:
/// - **stake pool** (`stake_token`): slash proceeds → written to `stake_delta`.
/// - **fee pool** (`fee_token`): non-revealer fees + forfeited bonds → written
///   to `fees_earned`. Revealers already received their base `fee_per_juror`
///   credit at `finalize_round`; only the forfeited portion redistributes here.
///
/// Recipient selection (bean accord-aqmw):
/// - `coherent_count > 0`: pools split among **coherent** jurors (normal).
/// - `coherent_count == 0, reveal_count > 0`: pools split among **revealers** —
///   those who at least participated, even though none matched the final
///   ruling (typically a prior round overturned on appeal). Non-revealers are
///   slashed but receive no reward.
/// - `coherent_count == 0, reveal_count == 0`: nobody is rewarded. Both pools
///   are trapped in vault custody as permanent Subaccord protocol surplus
///   (follow-up: authority-claimable withdrawal).
/// Decrements `active_draws` for every drawn juror (releases the unstake lock).
///
/// `pool_extra` is the forfeited (no-flip) appeal-bond total (final round only;
/// 0 for prior rounds). All adjustments are ledger-only — no SPL transfers.
fn settle_round_accounts(
    round: &Round,
    terms: &CaseTerms,
    sub_key: &Pubkey,
    accounts: &[AccountInfo],
    final_ruling: u8,
    pool_extra: u64,
) -> Result<()> {
    let panel = round.juror_count as usize;
    require!(accounts.len() == panel, AccordError::InvalidPanelSize);

    let slash_per_juror = (terms.alpha_bps as u64)
        .checked_mul(terms.min_stake)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(AccordError::ArithmeticOverflow)?;

    // --- First pass: verify PDAs + compute coherence stats ---
    let mut coherent_count: u32 = 0;
    let mut slash_total: u64 = 0;
    for i in 0..panel {
        let expected_pda = Pubkey::find_program_address(
            &[SEED_JUROR_STAKE, sub_key.as_ref(), round.jurors[i].as_ref()],
            &crate::ID,
        )
        .0;
        require!(
            accounts[i].key == &expected_pda,
            AccordError::InvalidMembershipProof
        );
        require!(
            accounts[i].owner == &crate::ID,
            AccordError::InvalidMembershipProof
        );

        if round.reveals[i] != u8::MAX && round.reveals[i] == final_ruling {
            coherent_count += 1;
        } else {
            slash_total = slash_total
                .checked_add(slash_per_juror)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }
    }

    // Fee pool (fee_token): non-revealer fees + forfeited bonds (ADR-0020).
    // Revealers already got their base fee at finalize_round; only the
    // forfeited portion redistributes here.
    let non_revealer_fee = ((panel as u64).saturating_sub(round.reveal_count as u64))
        .checked_mul(terms.fee_per_juror)
        .ok_or(AccordError::ArithmeticOverflow)?;
    let fee_pool = non_revealer_fee
        .checked_add(pool_extra)
        .ok_or(AccordError::ArithmeticOverflow)?;

    // Recipient pool: coherent jurors normally; when none are coherent
    // (a prior round overturned on appeal, or a degenerate
    // reveal_threshold_bps = 0 config), fall back to revealers — those
    // who at least participated. Non-revealers are NEVER rewarded.
    // When reveal_count is also 0 (no-show round), reward_count = 0 and
    // both pools are trapped in vault custody as permanent Subaccord
    // protocol surplus (bean accord-aqmw / follow-up: make claimable via
    // authority withdrawal). Integer-div remainder → protocol surplus.
    let reward_count: u32 = if coherent_count > 0 {
        coherent_count
    } else {
        round.reveal_count as u32
    };
    let stake_share = if reward_count > 0 {
        slash_total / reward_count as u64
    } else {
        0
    };
    let fee_share = if reward_count > 0 {
        fee_pool / reward_count as u64
    } else {
        0
    };

    // --- Second pass: apply slashes/rewards to stake_delta + fees_earned + decrement draws ---
    // ADR-0020: do NOT mutate `staked` — the accumulator root commits to it.
    // Write the net stake_delta instead; `reconcile_stake` folds it into
    // `staked` later via a Merkle proof. Fee rewards go to `fees_earned`.
    // CU-opt field access — see `crate::layout`.
    const STAKED_OFFSET: usize = crate::layout::JS_STAKED_OFF;
    const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
    const STAKE_DELTA_OFFSET: usize = crate::layout::JS_STAKE_DELTA_OFF;
    const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
    const FEES_EARNED_OFFSET: usize = crate::layout::JS_FEES_EARNED_OFF;

    for i in 0..panel {
        let acct_info = &accounts[i];
        let is_coherent = round.reveals[i] != u8::MAX && round.reveals[i] == final_ruling;

        let (staked, active_draws, existing_delta, slash_reserve, existing_fees) = {
            let data = acct_info.try_borrow_data()?;
            if data.len() < FEES_EARNED_OFFSET + 8 {
                return Err(AccordError::InvalidMembershipProof.into());
            }
            let stk =
                u64::from_le_bytes(data[STAKED_OFFSET..STAKED_OFFSET + 8].try_into().unwrap());
            let draws = u32::from_le_bytes(
                data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                    .try_into()
                    .unwrap(),
            );
            let delta = i64::from_le_bytes(
                data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            let reserve = u64::from_le_bytes(
                data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            let fees = u64::from_le_bytes(
                data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            (stk, draws, delta, reserve, fees)
        };

        // Slash every non-coherent juror (incoherent voter or no-show).
        // Reward eligibility: coherent normally; revealers as fallback when
        // no juror is coherent. Non-revealers are never rewarded.
        let is_reward_eligible = if coherent_count > 0 {
            is_coherent
        } else {
            round.reveals[i] != u8::MAX
        };
        let slash_delta = if is_coherent {
            0i64
        } else {
            -(slash_per_juror.min(staked) as i64)
        };
        let new_delta =
            existing_delta
                .saturating_add(slash_delta)
                .saturating_add(if is_reward_eligible {
                    stake_share as i64
                } else {
                    0
                });
        let new_fees = if is_reward_eligible {
            existing_fees
                .checked_add(fee_share)
                .ok_or(AccordError::ArithmeticOverflow)?
        } else {
            existing_fees
        };
        let new_draws = active_draws.saturating_sub(1);
        let new_reserve = slash_reserve.saturating_sub(slash_per_juror);

        let mut data = acct_info.try_borrow_mut_data()?;
        data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8].copy_from_slice(&new_delta.to_le_bytes());
        data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
            .copy_from_slice(&new_draws.to_le_bytes());
        data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
            .copy_from_slice(&new_reserve.to_le_bytes());
        data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8].copy_from_slice(&new_fees.to_le_bytes());
    }

    Ok(())
}

/// Account context for `health` — the caller signs (liveness probe), no state.
#[derive(Accounts)]
pub struct Health<'info> {
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializePause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + PauseState::INIT_SPACE,
        seeds = [SEED_PAUSE],
        bump,
    )]
    pub pause_state: Account<'info, PauseState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
}

#[derive(Accounts)]
pub struct ProposeUnpause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
}

#[derive(Accounts)]
pub struct ExecuteUnpause<'info> {
    /// Any cranker pays the tx fee; no authority check on execute (ADR-0007:
    /// the notice period, not the signer, gates the unpause).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
}

/// Account context for `create_subaccord` (veridao-ek65).
///
/// `init` (not `init_if_needed`) enforces the account is fresh, giving the
/// re-init guard and namespace-capture prevention for free. The canonical bump
/// from `find_program_address` is reused and stored on the account.
#[derive(Accounts)]
#[instruction(risk_type: [u8; 32])]
pub struct CreateSubaccord<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Subaccord::INIT_SPACE,
        seeds = [SEED_SUBACCORD, creator.key().as_ref(), risk_type.as_ref()],
        bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    /// L-4: validated as a real legacy SPL Mint — `Account<Mint>` from
    /// `anchor_spl::token` checks ownership against the Token Program ID,
    /// rejecting Token-2022 mints (owned by Token-2022 Program) by construction.
    pub staking_token: Account<'info, Mint>,
    pub fee_token: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

/// Account context for `stake` (veridao-ja2w).
///
/// - `subaccord` is re-derived from its stored seeds (`creator`, `risk_type`)
///   + canonical bump so a wrong/forged pool is rejected.
/// - `staking_token` is constrained to the Subaccord's declared mint.
/// - `juror_token_account` is the Juror's canonical ATA for that mint.
/// - `vault` is the **Subaccord PDA's** ATA (lazily created on first stake) so
///   the program can move funds out on `unstake` (PDA-signed).
/// - `juror_stake` is init'd on first stake, topped up thereafter
///   (`init_if_needed`); `active_draws` is never touched here.
/// - `pause_state` enforces the ADR-0007 circuit breaker.
#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    /// Circuit breaker (ADR-0007): stake reverts while paused.
    #[account(seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
    #[account(
        init_if_needed,
        payer = juror,
        space = 8 + JurorStake::INIT_SPACE,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    /// Must be the Subaccord's declared staking token.
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = juror,
    )]
    pub juror_token_account: Account<'info, TokenAccount>,
    /// Subaccord PDA's stake_vault ATA; `authority` (wallet) is the Subaccord PDA.
    #[account(
        init_if_needed,
        payer = juror,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Account context for `unstake` (veridao-b2sc).
///
/// Mirror of `Stake` minus the pause account (unstake is never halted —
/// ADR-0007 traps no capital) and minus `init_if_needed`/`associated_token_program`
/// (both accounts already exist: the vault was created on first stake, the
/// `JurorStake` on first stake). The vault is the **Subaccord PDA's** ATA so the
/// program PDA-signs the transfer out.
/// Account context for `request_withdraw` (REVIEW #5). Ledger-only — updates
/// the accumulator root and JurorStake. No token transfer.
#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
}

/// Account context for `withdraw` (REVIEW #5). Transfers locked tokens from
/// the vault to the juror's ATA (PDA-signed). No root update — root was
/// updated at `request_withdraw` time.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = juror,
    )]
    pub juror_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Account context for `reconcile_stake` (REVIEW #4). Permissionless — any
/// caller may trigger. No token accounts needed (pure ledger + root update).
#[derive(Accounts)]
pub struct ReconcileStake<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror_stake.juror.as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
}

/// Account context for `prune_juror` (PROG-ATTESTTION). Permissionless — the
/// `caller` signs (any cranker); the expired `juror` does NOT sign. The
/// `JurorStake` PDA is seeded off the passed `juror`, so derivation links the
/// stake record to the juror identity used for the attestation subject check.
/// `remaining_accounts[0]` carries the expired SAS attestation (read-only
/// proof). No token accounts — prune is ledger-only (the SPL transfer happens
/// at the two-phase `withdraw`).
#[derive(Accounts)]
pub struct PruneJuror<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: the expired juror — NOT a signer (prune is permissionless). Its
    /// address seeds the `JurorStake` PDA below, linking the two.
    pub juror: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    pub system_program: Program<'info, System>,
    // remaining_accounts[0] = the expired SAS attestation (read-only proof).
}

/// Account context for `propose_subaccord_update` (veridao-y63e).
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ProposeSubaccordUpdate<'info> {
    /// Must equal `subaccord.authority`; signs + pays for the PendingUpdate.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        init,
        payer = authority,
        space = 8 + PendingUpdate::INIT_SPACE,
        seeds = [SEED_PENDING_UPDATE, subaccord.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub pending_update: Account<'info, PendingUpdate>,
    pub system_program: Program<'info, System>,
}

/// Account context for `execute_subaccord_update` (veridao-y63e).
///
/// Permissionless: any caller may land the update once the timelock elapses.
/// The `PendingUpdate` is re-derived from the Subaccord + its stored nonce +
/// canonical bump, and closed on success (rent refunded to the caller).
#[derive(Accounts)]
pub struct ExecuteSubaccordUpdate<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        mut,
        seeds = [SEED_PENDING_UPDATE, subaccord.key().as_ref(), &pending_update.nonce.to_le_bytes()],
        bump = pending_update.bump,
        close = caller,
    )]
    pub pending_update: Account<'info, PendingUpdate>,
}

// --- Dispute intake & Snapshot account contexts (veridao-rrxs) ---------------

/// Account context for `create_dispute` — the Arbitrable CPI entry.
///
/// `filer` is the Arbitrable (a program signer via CPI, or any wallet). The
/// dispute PDA is `["dispute", filer, nonce]` (caller-chosen nonce gives the
/// filer a private dispute namespace). The fee moves from the filer's ATA into
/// the Subaccord PDA's fee_vault; the fee_vault must already exist (guaranteed: the
/// `staker_count >= N` gate implies at least one prior stake created it).
#[derive(Accounts)]
#[instruction(options: Vec<[u8; 32]>, evidence_hash: [u8; 32], nonce: u64, fee: u64)]
pub struct CreateDispute<'info> {
    #[account(mut)]
    pub filer: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
    #[account(
        init,
        payer = filer,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [SEED_DISPUTE, filer.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = filer,
    )]
    pub filer_token_account: Account<'info, TokenAccount>,
    /// Subaccord PDA's fee_vault ATA (ADR-0020). Created on first dispute if
    /// it doesn't exist yet.
    #[account(
        init_if_needed,
        payer = filer,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Account context for `request_vrf` (ADR-0009/0012). Uses `#[vrf]` to gain
/// `invoke_signed_vrf` for the CPI into the VRF program. The subaccord is
/// forwarded to the callback so it can copy the live accumulator root.
#[vrf]
#[derive(Accounts)]
pub struct RequestVrf<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// CHECK: VRF oracle queue (mainnet default).
    #[account(mut, address = ephemeral_rollups_sdk::vrf::consts::DEFAULT_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

/// Account context for `commit_vrf_callback` (ADR-0009/0012). The
/// `vrf_program_identity` signer is constrained to the VRF program's identity
/// — ONLY the VRF program can call this. The subaccord is read-only here: the
/// callback copies its live `root_hash`/`total_stake` onto the dispute as the
/// frozen root.
#[derive(Accounts)]
pub struct CommitVrfCallback<'info> {
    #[account(address = ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity(&crate::ID))]
    pub vrf_program_identity: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
}

/// Account context for `draw_seat` (ADR-0012). Permissionless: any caller
/// submits one seat's membership proof. The round is `init_if_needed`
/// (zero-copy) so it persists across the N seat transactions; the drawn
/// juror's `JurorStake` is `remaining_accounts[0]` (the only per-seat account
/// beyond dispute + round, keeping the tx well under the 1232-byte limit).
#[derive(Accounts)]
pub struct DrawSeat<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// PROG-ATTESTTION: the backing Subaccord. Always passed; the credential
    /// re-check activates only when `juror_credential != default`.
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
        constraint = dispute.subaccord == subaccord.key() @ AccordError::SubaccordMismatch,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        init_if_needed,
        payer = caller,
        space = 8 + std::mem::size_of::<Round>(),
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    pub system_program: Program<'info, System>,
}

// --- Voting & Ruling account contexts (veridao-pq1s) --------------------------

/// Account context for `commit`. The juror signs; the round is zero-copy
/// (`AccountLoader`), re-derived from the dispute + current round.
#[derive(Accounts)]
pub struct Commit<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `reveal`. Same shape as `Commit` — ADR-0020 removed the
/// participation-fee SPL transfer (fees are credited at `finalize_round`
/// instead). No token accounts needed.
#[derive(Accounts)]
pub struct Reveal<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `finalize_round` — permissionless crank.
#[derive(Accounts)]
pub struct FinalizeRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `finalize_dispute` — permissionless crank. Drawn
/// `JurorStake` accounts are passed as `remaining_accounts` (mut), verified
/// against the round's juror list + PDA derivation inside the handler. Appeal
/// bonds are settled ledger-style here: forfeited (no-flip) bonds fold into the
/// coherent pool; flipped bonds are returned by the separate
/// `claim_appeal_refund` crank.
#[derive(Accounts)]
pub struct FinalizeDispute<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `settle_round` — permissionless crank that settles a
/// prior round's coherence economics against the finalized ruling (Ugly 5).
/// The round PDA is keyed by the instruction arg `round_idx` (not
/// `current_round`). Drawn `JurorStake` accounts are `remaining_accounts`.
#[derive(Accounts)]
#[instruction(round_idx: u32)]
pub struct SettleRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &round_idx.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `appeal` (ADR-0004). Permissionless: `appellant` is any
/// signer. The resolved round (`current_round`) is read for the appeal-window
/// deadline and the prior ruling; the fee + bond move from the appellant's ATA
/// into the vault. The bond is custodied in a per-appeal `AppealBond` PDA keyed
/// by the round being appealed (`current_round`, before it is incremented).
#[derive(Accounts)]
pub struct Appeal<'info> {
    #[account(mut)]
    pub appellant: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    // ponytail: `pause_state` is retained here for IDL/SDK stability but is NOT
    // consulted — `appeal` is never pausable (ADR-0016). Drop this field in a
    // coordinated IDL revision (pair with the accord-r6ti settlement rework).
    #[account(seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// The round just resolved (`dispute.current_round`) — read-only; supplies
    /// `reveal_end` for the appeal-window check and `result` (the prior ruling).
    #[account(
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    /// Per-appeal bond custody (ADR-0004). Keyed by the round being appealed.
    #[account(
        init,
        payer = appellant,
        space = 8 + AppealBond::INIT_SPACE,
        seeds = [SEED_APPEAL_BOND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub appeal_bond: Box<Account<'info, AppealBond>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = appellant,
    )]
    pub appellant_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = appellant,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Account context for `claim_appeal_refund` — permissionless crank returning a
/// flipped appeal bond. `round_idx` (instruction arg) selects the bond PDA
/// `["bond", dispute, round_idx]`. The refund sweep is PDA-signed out of the
/// vault into the claimant's ATA; the handler verifies the ATA belongs to the
/// bond's recorded appellant. Named accounts only (no `remaining_accounts`)
/// keeps the CPI lifetime-uniform.
#[derive(Accounts)]
#[instruction(round_idx: u32)]
pub struct ClaimAppealRefund<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// The specific appeal bond being claimed.
    #[account(
        mut,
        seeds = [SEED_APPEAL_BOND, dispute.key().as_ref(), &round_idx.to_le_bytes()],
        bump = appeal_bond.bump,
    )]
    pub appeal_bond: Box<Account<'info, AppealBond>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    /// The appellant's ATA — sweep destination. Any caller may pass it; the
    /// handler rejects it unless its owner matches the bond's recorded appellant.
    #[account(mut, token::mint = fee_token)]
    pub claimant_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Account context for `get_ruling` — read-only CPI entry for Arbitrables.
#[derive(Accounts)]
pub struct GetRuling<'info> {
    /// Fee payer for the transaction (CPI caller or cranker).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
}

/// Account context for `cancel_dispute` (CONCEPT-REVIEW Ugly 4) — the
/// permissionless liveness-escape crank. `filer_token_account` is constrained
/// to the dispute's filer (the refund destination); the vault is the Subaccord
/// PDA's ATA so the program PDA-signs the refund out. Post-draw cancels pass
/// the current `Round` + its drawn `JurorStake` PDAs as `remaining_accounts`.
#[derive(Accounts)]
pub struct CancelDispute<'info> {
    /// Any cranker; no authority check (the elapsed timeout is the gate).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    /// Refund destination — must be the filer's ATA.
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = dispute.filer,
    )]
    pub filer_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Account context for `withdraw_fees` (ADR-0020). Per-juror pull of
/// aggregate `fees_earned` from the Subaccord's `fee_vault` → the juror's
/// `fee_token` ATA. No `active_draws` gate, no timelock.
#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = juror,
    )]
    pub juror_fee_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Account context for `redraw` (ADR-0021) — the permissionless shortfall
/// crank. Same token-account shape as `CancelDispute` (the Fail branch refunds
/// the filer from the `fee_vault`); the Redraw branch leaves them untouched.
/// `remaining_accounts` carries the current round's `JurorStake` PDAs (always)
/// and, on exhaustion, prior appeal rounds + their bonds (same layout as
/// `cancel_dispute`).
#[derive(Accounts)]
pub struct Redraw<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// The shortfall round (`dispute.current_round`).
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    /// Filer refund destination (Fail branch). Unused on the Redraw branch but
    /// always validated — the cranker passes it regardless.
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = dispute.filer,
    )]
    pub filer_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Emitted by `health`. Carries the program version byte.
#[event]
pub struct HealthChecked {
    pub version: u8,
}

// --- Tests (ADR-0012 accumulator MST math) -----------------------------------
//
// Pure unit tests for the subtree-sum accumulator helpers. These are the
// byte-exact reference the SDK MST builder must match: leaf = H(juror||stake),
// node = H(left_hash||left_sum||right_hash||right_sum). The full LiteSVM +
// Surfpool instruction suite is bean accord-btel; this is the self-check for
// the non-trivial on-chain math (verify_and_recompute + verify_membership_and_prefix
// + empty_tree_root).
#[cfg(test)]
mod accumulator_tests {
    use super::*;

    /// Deterministic test pubkey from a small integer.
    fn pk(n: u8) -> Pubkey {
        Pubkey::new_from_array([n; 32])
    }

    /// Build a depth-`depth` subtree-sum tree from `leaves` (index = position),
    /// padding the remaining 2^depth slots with zero leaves. Returns
    /// `(root_hash, root_sum, path_for(target))`.
    fn build_root_and_path(
        leaves: &[(Pubkey, u64)],
        depth: u8,
        target: u32,
    ) -> ([u8; 32], u64, Vec<MSTNode>) {
        let size = 1usize << depth;
        let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(size);
        let mut sums: Vec<u64> = Vec::with_capacity(size);
        for i in 0..size {
            let (j, s) = if i < leaves.len() {
                leaves[i]
            } else {
                (Pubkey::default(), 0u64)
            };
            hashes.push(mst_leaf_hash(&j, s));
            sums.push(s);
        }
        let mut path = Vec::new();
        let mut idx = target as usize;
        for _ in 0..depth {
            let sib = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
            path.push(MSTNode {
                sibling_hash: hashes[sib],
                sibling_sum: sums[sib],
            });
            let mut nh = Vec::new();
            let mut ns = Vec::new();
            for k in (0..hashes.len()).step_by(2) {
                nh.push(mst_node_hash(
                    &hashes[k],
                    sums[k],
                    &hashes[k + 1],
                    sums[k + 1],
                ));
                ns.push(sums[k] + sums[k + 1]);
            }
            hashes = nh;
            sums = ns;
            idx /= 2;
        }
        assert_eq!(hashes.len(), 1, "depth fold yields a single root");
        (hashes[0], sums[0], path)
    }

    #[test]
    fn empty_root_matches_all_zero_tree() {
        for depth in [0u8, 1, 3, 8, 20] {
            let (root, sum, _) = build_root_and_path(&[], depth, 0);
            assert_eq!(root, empty_tree_root(depth), "depth {depth}");
            assert_eq!(sum, 0, "empty tree has zero total stake");
        }
    }

    #[test]
    fn membership_authenticates_and_prefix_is_correct() {
        // Three jurors with unequal stakes at depth 4 (16 slots).
        let leaves = vec![(pk(1), 1_000), (pk(2), 3_000), (pk(3), 500)];
        let depth = 4u8;
        let (root, total, _) = build_root_and_path(&leaves, depth, 0);
        assert_eq!(total, 4_500);

        // Each leaf verifies and its prefix is the running sum of earlier leaves.
        let mut running = 0u64;
        for (i, (_, stake)) in leaves.iter().enumerate() {
            let (_, _, path) = build_root_and_path(&leaves, depth, i as u32);
            let leaf = LeafClaim {
                juror: pk((i + 1) as u8),
                stake: *stake,
            };
            let prefix =
                verify_membership_and_prefix(&leaf, i as u32, &path, &root, total).unwrap();
            assert_eq!(prefix, running, "prefix for leaf {i}");
            running += stake;
        }

        // A wrong root is rejected.
        let bad = [0u8; 32];
        let leaf0 = LeafClaim {
            juror: pk(1),
            stake: 1_000,
        };
        let (_, _, path0) = build_root_and_path(&leaves, depth, 0);
        assert!(verify_membership_and_prefix(&leaf0, 0, &path0, &bad, total).is_err());

        // A tampered stake (overstates) does not authenticate — the root binds sums.
        let inflated = LeafClaim {
            juror: pk(2),
            stake: 9_999,
        };
        let (_, _, path1) = build_root_and_path(&leaves, depth, 1);
        assert!(verify_membership_and_prefix(&inflated, 1, &path1, &root, total).is_err());
    }

    #[test]
    fn verify_and_recompute_matches_rebuild() {
        let leaves = vec![(pk(1), 1_000), (pk(2), 3_000), (pk(3), 500), (pk(4), 2_000)];
        let depth = 5u8;
        let (root, total, _) = build_root_and_path(&leaves, depth, 0);

        // Top up juror at index 2: stake 500 -> 1_500.
        let target = 2u32;
        let old_stake = 500u64;
        let new_stake = 1_500u64;
        let juror = pk(3);
        let (_, _, path) = build_root_and_path(&leaves, depth, target);
        let (new_root, new_total) = verify_and_recompute(
            &juror, old_stake, &juror, new_stake, target, &path, &root, total,
        )
        .expect("valid path authenticates + recomputes");
        assert_eq!(new_total, total - old_stake + new_stake);

        // Rebuild from scratch with the new stake: roots must match exactly.
        let mut rebuilt = leaves.clone();
        rebuilt[target as usize] = (juror, new_stake);
        let (rebuilt_root, rebuilt_total, _) = build_root_and_path(&rebuilt, depth, target);
        assert_eq!(new_root, rebuilt_root, "recomputed root matches rebuild");
        assert_eq!(new_total, rebuilt_total);

        // A stale/wrong path is rejected and does not yield a root.
        let wrong_path = build_root_and_path(&leaves, depth, 0).2; // path for index 0, not 2
        assert!(verify_and_recompute(
            &juror,
            old_stake,
            &juror,
            new_stake,
            target,
            &wrong_path,
            &root,
            total
        )
        .is_err());
    }

    #[test]
    fn first_stake_transitions_zero_leaf_to_juror() {
        // Simulate a juror's first stake: the assigned slot holds the all-zero
        // leaf (default juror, 0 stake); after staking it becomes (juror, stake).
        let depth = 4u8;
        let (root0, total0, _) = build_root_and_path(&[], depth, 0); // empty tree
        assert_eq!(root0, empty_tree_root(depth));

        let juror = pk(7);
        let stake = 2_500u64;
        let target = 0u32;
        let (_, _, path) = build_root_and_path(&[], depth, target);
        let (new_root, new_total) = verify_and_recompute(
            &Pubkey::default(),
            0,
            &juror,
            stake,
            target,
            &path,
            &root0,
            total0,
        )
        .expect("zero-slot path authenticates + recomputes to the juror leaf");

        // Rebuild with the juror at index 0 must match.
        let (rebuilt_root, rebuilt_total, _) =
            build_root_and_path(&[(juror, stake)], depth, target);
        assert_eq!(new_root, rebuilt_root);
        assert_eq!(new_total, rebuilt_total);
        assert_eq!(new_total, stake);
    }

    #[test]
    fn sortition_prefix_brackets_vrf_seat() {
        // For every seat value (at retry 0), the deterministic r_i must fall
        // into exactly one leaf's [prefix, prefix+stake) range — proving
        // sortition is total and non-overlapping for the reconstructed prefixes.
        let leaves = vec![(pk(1), 1_000), (pk(2), 3_000), (pk(3), 500), (pk(4), 2_000)];
        let depth = 4u8;
        let (root, total, _) = build_root_and_path(&leaves, depth, 0);
        let vrf = [99u8; 32];
        let dispute_key = pk(42);
        let round_idx = 0u32;
        let vrf_seed =
            solana_program::hash::hashv(&[&vrf, dispute_key.as_ref(), &round_idx.to_le_bytes()])
                .to_bytes();

        for seat in 0..4u32 {
            let retry = 0u32;
            let r = solana_program::hash::hashv(&[
                &vrf_seed,
                &seat.to_le_bytes(),
                &retry.to_le_bytes(),
            ])
            .to_bytes();
            let r_i = u64::from_le_bytes(r[0..8].try_into().unwrap()) % total;
            let mut found = false;
            let mut running = 0u64;
            for (i, (_, stake)) in leaves.iter().enumerate() {
                let prefix = running;
                if r_i >= prefix && r_i - prefix < *stake {
                    // This leaf wins seat `seat`; verify the on-chain prefix fn agrees.
                    let (_, _, path) = build_root_and_path(&leaves, depth, i as u32);
                    let leaf = LeafClaim {
                        juror: pk((i + 1) as u8),
                        stake: *stake,
                    };
                    let got =
                        verify_membership_and_prefix(&leaf, i as u32, &path, &root, total).unwrap();
                    assert_eq!(got, prefix);
                    assert!(found == false, "r_i matched more than one leaf");
                    found = true;
                }
                running += stake;
            }
            assert!(found, "seat {seat}: r_i={r_i} matched no leaf range");
        }
    }
}
