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
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("Vault received less than the stake (fee-on-transfer mint?).")]
    StakeTransferShortfall,
}
