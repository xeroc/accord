//! `propose_court_update` handler — see `ProposeCourtUpdate` accounts struct
//! in `lib.rs`.
//!
//! CPIs Accord `propose_subaccord_update` for the list's backing court with
//! the CanonList PDA as the Subaccord authority (`invoke_signed`) and the
//! caller (the list authority) as rent payer. Canon adds exactly two guard
//! classes on top of Accord's own validation:
//! - `UpdatePayload::Authority` is forbidden — the court authority is pinned
//!   to the list PDA; rotating it off would permanently strand retuning
//!   behind a key that can never again sign through canon.
//! - the `create_list` mirrors: `AlphaBps <= 10_000` and nonzero
//!   review/commit/reveal windows (anti-brick).
//! Everything else (appeals cap, ladder fit, reveal-threshold bounds,
//! appeal-window floor, draw-attempt bounds) rides Accord's
//! `validate_update_payload` + cross-field checks and its errors propagate.
//! The 48h timelock and the permissionless execute live entirely in Accord —
//! canon ships NO execute wrapper.

use crate::constants::SEED_CANON_LIST;
use crate::errors::CanonError;
use crate::events::*;
use crate::ProposeCourtUpdate;
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<ProposeCourtUpdate>,
    nonce: u64,
    payload: accord::state::UpdatePayload,
) -> Result<()> {
    require!(
        ctx.accounts.caller.key() == ctx.accounts.list.authority,
        CanonError::Unauthorized
    );
    require!(
        !matches!(payload, accord::state::UpdatePayload::Authority(_)),
        CanonError::ForbiddenPayload
    );
    // --- create_list guard mirrors (bounds Accord does not enforce itself) ---
    if let accord::state::UpdatePayload::AlphaBps(v) = payload {
        require!(v <= 10_000, CanonError::AlphaTooHigh);
    }
    if let accord::state::UpdatePayload::ReviewWindow(v)
    | accord::state::UpdatePayload::CommitWindow(v)
    | accord::state::UpdatePayload::RevealWindow(v) = &payload
    {
        require!(*v > 0, CanonError::WindowTooShort);
    }

    // --- CPI: Accord propose_subaccord_update, the CanonList PDA signs ------
    // Snapshot signer material first so the immutable `list` borrow ends
    // before the CPI reborrows the account info.
    let list = &ctx.accounts.list;
    let list_key = list.key();
    let creator = list.creator;
    let rules_hash = list.rules_hash;
    let signer_bump = list.bump;

    let cpi_accounts = accord::cpi::accounts::ProposeSubaccordUpdate {
        authority: list.to_account_info(),
        rent_payer: ctx.accounts.caller.to_account_info(),
        subaccord: ctx.accounts.subaccord.to_account_info(),
        pending_update: ctx.accounts.pending_update.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CANON_LIST,
        creator.as_ref(),
        rules_hash.as_ref(),
        &[signer_bump],
    ]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.accord_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    accord::cpi::propose_subaccord_update(cpi_ctx, nonce, payload.clone())?;

    emit!(CourtUpdateProposed {
        list: list_key,
        subaccord: ctx.accounts.subaccord.key(),
        nonce,
        payload,
    });

    Ok(())
}
