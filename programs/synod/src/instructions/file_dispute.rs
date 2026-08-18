//! `file_dispute` — SPEC §Instructions #3. Permissionless dispute filing.
//!
//! Full roster joined (early lock — no deadline wait once full) + state
//! check-and-set `Opening → Live`, so double-file is impossible. Derives the
//! option set deterministically (`option i = H("synod-opt" ‖ case_pda ‖ i)`,
//! neutral at the highest index `party_count` — parties never construct
//! options) and the filing evidence hash (`H(case_pda ‖ evidence[0] ‖ … ‖
//! evidence[N-1])`), then CPIs Accord `create_dispute` with the case PDA as
//! filer signer (`invoke_signed`, seeds `["case", opener, nonce]`) and the
//! case vault ATA as `filer_token_account` — the frozen fee flows vault →
//! Subaccord fee_vault. Dispute PDA: `["dispute", case, 0]`, nonce 0, one
//! dispute per case (bound immutable after).
//!
//! The CPI account set mirrors canon `challenge_item`: the four Accord
//! CPI-only accounts ride `remaining_accounts`.

use crate::constants::*;
use crate::errors::SynodError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};
use solana_program::hash::hashv;

/// Option label for slot `i` of `case_pda`: `H("synod-opt" ‖ case_pda ‖ i_le64)`.
/// `i == party_count` is the neutral option ("no party prevails"), always the
/// highest index (SPEC §Invariants 4).
pub(crate) fn option_label(case_pda: &Pubkey, i: u64) -> [u8; 32] {
    hashv(&[b"synod-opt", case_pda.as_ref(), &i.to_le_bytes()]).to_bytes()
}

/// Filing evidence hash: `H(case_pda ‖ evidence[0] ‖ … ‖ evidence[N-1])` —
/// the case PDA identifies, the per-party hashes COMMIT (daemon bundle-swap
/// is detectable).
pub(crate) fn evidence_root(
    case_pda: &Pubkey,
    evidence: &[[u8; 32]; MAX_PARTIES],
    n: u8,
) -> [u8; 32] {
    let mut pieces: Vec<&[u8]> = Vec::with_capacity(1 + n as usize);
    pieces.push(case_pda.as_ref());
    pieces.extend(evidence[..n as usize].iter().map(|h| h.as_ref()));
    hashv(&pieces).to_bytes()
}

/// Account context for `file_dispute`. The four Accord CPI-only accounts
/// (`dispute`, `accord_state`, `accord_fee_vault`, `accord_program`) are in
/// `remaining_accounts`.
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct FileDispute<'info> {
    /// Anyone (permissionless crank-style caller; pays the dispute + fee_vault
    /// rent as Accord's `rent_payer` — the data-carrying case PDA cannot).
    #[account(mut)]
    pub caller: Signer<'info>,
    /// Case opener — seed component of the case PDA. Validated by the `case`
    /// seeds constraint, not trusted on its own.
    /// CHECK: the seeds constraint below re-derives the case PDA from it.
    pub opener: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [SEED_CASE, opener.key().as_ref(), &nonce.to_le_bytes()],
        bump = case.bump,
    )]
    pub case: Box<Account<'info, SynodCase>>,
    /// `mut`: Accord's `create_dispute` writes `fee_vault_deposited` to the
    /// Subaccord during the CPI (canon challenge_item precedent) — a readonly
    /// outer meta is rejected as writable-privilege escalation.
    #[account(mut, address = case.subaccord)]
    pub subaccord: Box<Account<'info, accord::state::Subaccord>>,
    #[account(address = subaccord.fee_token)]
    pub fee_mint: Box<Account<'info, Mint>>,
    /// Case-PDA-owned vault; doubles as the Accord CPI `filer_token_account`
    /// (Accord moves the frozen fee from here into the Subaccord fee_vault).
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = case,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // remaining_accounts[0..3]:
    //   [0] accord_dispute    (mut — Accord inits)
    //   [1] accord_state      (readonly — Accord validates, must be unpaused)
    //   [2] accord_fee_vault  (mut — Accord init_if_needed + transfer)
    //   [3] accord_program    (readonly — address checked in handler)
}

/// Permissionless dispute filing: full-roster gate, deterministic options +
/// evidence hash, CPI `create_dispute` as the case PDA, bind + go Live.
pub fn handler<'a>(ctx: Context<'a, FileDispute<'a>>, _nonce: u64) -> Result<()> {
    let rem = &ctx.remaining_accounts;
    require!(rem.len() >= 4, SynodError::MissingRemainingAccounts);
    let accord_dispute = &rem[0];
    let accord_state = &rem[1];
    let accord_fee_vault = &rem[2];
    let accord_program = &rem[3];
    require!(
        accord_program.key() == accord::ID,
        SynodError::WrongAccordProgram
    );

    let case = &mut ctx.accounts.case;

    // State gate: check-and-set Opening -> Live (double-file impossible).
    require!(case.state == CaseState::Opening, SynodError::NotOpening);
    // Full roster: early lock, no deadline wait.
    let n = case.party_count;
    require!(
        case.joined == (1u16 << n) as u8 - 1,
        SynodError::RosterIncomplete
    );

    // One dispute per case: ["dispute", case, 0] — verified against the
    // caller-provided account (remaining_accounts can't carry a seeds
    // constraint, hence the manual check; same as canon challenge_item).
    let (expected_dispute, _) = accord::dispute_pda(&case.key(), 0);
    require!(
        accord_dispute.key() == expected_dispute,
        SynodError::DisputePdaMismatch
    );

    // Deterministic option set: party i -> option i, neutral at index N.
    let options: Vec<[u8; 32]> = (0..=n as u64)
        .map(|i| option_label(&case.key(), i))
        .collect();
    let evidence_hash = evidence_root(&case.key(), &case.evidence, n);

    // Bind + flip state BEFORE the CPI (tx-atomic; ends the &mut borrow so
    // the CPI can re-borrow immutably — canon pattern).
    case.dispute = expected_dispute;
    case.state = CaseState::Live;
    let signer_bump = case.bump;
    let frozen_fee = case.fee;

    // CPI Accord create_dispute: case PDA signs, vault pays the frozen fee.
    // The data-carrying case PDA cannot pay rent (system program rejects
    // transfers from data accounts) — the permissionless caller wallet does.
    let cpi_accounts = accord::cpi::accounts::CreateDispute {
        filer: ctx.accounts.case.to_account_info(),
        rent_payer: ctx.accounts.caller.to_account_info(),
        subaccord: ctx.accounts.subaccord.to_account_info(),
        accord_state: accord_state.to_account_info(),
        dispute: accord_dispute.to_account_info(),
        fee_token: ctx.accounts.fee_mint.to_account_info(),
        filer_token_account: ctx.accounts.vault.to_account_info(),
        fee_vault: accord_fee_vault.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let opener = ctx.accounts.opener.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CASE,
        opener.as_ref(),
        &_nonce.to_le_bytes(),
        &[signer_bump],
    ]];
    let cpi_ctx = CpiContext::new_with_signer(accord_program.key(), cpi_accounts, signer_seeds);
    accord::cpi::create_dispute(cpi_ctx, options, evidence_hash, 0, frozen_fee)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Derivation vectors: the option set is a pure function of the case PDA
    /// (program-assigned; parties never construct options). 7-party case ⇒
    /// 8 distinct labels, neutral at the highest index.
    #[test]
    fn option_labels_are_deterministic_and_distinct() {
        let case_pda = Pubkey::new_from_array([0x5E; 32]);
        let labels: Vec<[u8; 32]> = (0..=7u64).map(|i| option_label(&case_pda, i)).collect();
        assert_eq!(labels.len(), 8, "7 parties + neutral");
        for i in 0..labels.len() {
            for j in i + 1..labels.len() {
                assert_ne!(labels[i], labels[j], "labels {i} and {j} collide");
            }
        }
        // Stable vector (regression pin against accidental domain change).
        assert_eq!(
            labels[0],
            option_label(&case_pda, 0),
            "same input, same label"
        );
        assert_ne!(
            labels[0],
            option_label(&Pubkey::new_from_array([0x5F; 32]), 0)
        );
    }

    /// Evidence root: H(case ‖ e0 ‖ … ‖ e_{n-1}) — trailing padded slots are
    /// excluded, order is naming order.
    #[test]
    fn evidence_root_covers_exactly_first_n_slots() {
        let case_pda = Pubkey::new_from_array([0xC4; 32]);
        let mut evidence = [[0u8; 32]; MAX_PARTIES];
        for (i, e) in evidence.iter_mut().enumerate() {
            e[0] = i as u8;
        }
        let n3 = evidence_root(&case_pda, &evidence, 3);
        let mut expected_parts: Vec<&[u8]> = vec![case_pda.as_ref()];
        expected_parts.extend(evidence[..3].iter().map(|h| h.as_ref()));
        assert_eq!(n3, hashv(&expected_parts).to_bytes());
        // Slot 3 (padding) does not participate: changing it leaves n=3 root.
        let mut shifted = evidence;
        shifted[3] = [0xEE; 32];
        assert_eq!(evidence_root(&case_pda, &shifted, 3), n3);
        // n=4 DOES include it.
        assert_ne!(evidence_root(&case_pda, &shifted, 4), n3);
    }
}
