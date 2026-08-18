//! Synod error codes (SPEC §Open-time validations + §Instructions). Covers
//! every v1 instruction class; instruction beans select the variants they
//! need.

use anchor_lang::prelude::*;

#[error_code]
pub enum SynodError {
    #[msg("party_count must be 2..=MAX_PARTIES (7 party slots + 1 neutral option).")]
    InvalidPartyCount,
    #[msg("Parties must be distinct.")]
    DuplicateParty,
    #[msg("The opener must be parties[0] (naming order).")]
    OpenerNotFirstParty,
    #[msg("Signer is not a named party on this case.")]
    NotNamedParty,
    #[msg("This party has already joined.")]
    AlreadyJoined,
    #[msg("Case is not in the Opening state.")]
    NotOpening,
    #[msg("Roster incomplete: not all parties have joined.")]
    RosterIncomplete,
    #[msg("join_deadline has not been reached yet.")]
    JoinDeadlineNotReached,
    #[msg("join_deadline has passed.")]
    JoinDeadlinePassed,
    #[msg("The pot must be positive: party_count * stake must exceed the fee.")]
    PotNotPositive,
    #[msg("The Subaccord aggregation must be Plurality (Median scalars have no option mapping).")]
    AggregationNotPlurality,
    #[msg("Missing remaining_accounts for the Accord CPI.")]
    MissingRemainingAccounts,
    #[msg("Wrong Accord program account.")]
    WrongAccordProgram,
    #[msg("Dispute PDA does not match the expected derivation.")]
    DisputePdaMismatch,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("Vault received less than the stake (fee-on-transfer mint?).")]
    StakeTransferShortfall,
    #[msg("Accord dispute has not reached Final or Failed.")]
    DisputeNotFinal,
    #[msg("Dispute final_ruling is not a valid option index for this case.")]
    InvalidRuling,
    #[msg("Case is not in the Live state.")]
    CaseNotLive,
    #[msg("Roster is full — file_dispute, don't refund.")]
    RosterComplete,
    #[msg("This party never joined the case.")]
    PartyNotJoined,
    #[msg("Token account belongs to a different mint than the case escrow.")]
    WrongMint,
}
