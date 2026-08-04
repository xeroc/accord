//! State-definition tests (veridao-fxao). Pure host unit tests — no LiteSVM:
//! these check Anchor account round-trip (discriminator + Borsh), PDA seed
//! determinism, and that constants match the SPEC. They drive the RED->GREEN
//! for the state module. Instruction-level behavior is tested per-instruction
//! in `tests/health_litesvm.rs` and subsequent LiteSVM tests.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{MAX_JURORS, MAX_OPTIONS};
use accord::state::{
    Dispute, DisputeState, JurorStake, PendingUpdate, Round, Snapshot, SnapshotStatus, Subaccord,
    UpdatePayload,
};
use anchor_lang::{AccountDeserialize, AccountSerialize, AnchorDeserialize, AnchorSerialize};
use solana_program::pubkey::Pubkey;

/// Round-trip an `#[account]` type through Anchor's discriminator + Borsh and
/// back. Catches any field/encoding drift the moment a struct changes.
fn round_trip<T>(acc: &T) -> T
where
    T: AccountSerialize + AccountDeserialize,
{
    let mut buf = Vec::new();
    acc.try_serialize(&mut buf).unwrap();
    T::try_deserialize(&mut buf.as_slice()).unwrap()
}

fn sample_subaccord() -> Subaccord {
    Subaccord {
        creator: Pubkey::new_unique(),
        staking_token: Pubkey::new_unique(),
        min_stake: 1_000,
        jurors_per_dispute: 3,
        alpha_bps: 1_000, // 10%
        review_window: 7 * 24 * 3600,
        commit_window: 2 * 24 * 3600,
        reveal_window: 2 * 24 * 3600,
        max_appeals: 3,
        fee_per_juror: 1_000_000,
        authority: Pubkey::default(), // immutable
        evidence_operator: Pubkey::new_unique(),
        risk_type: [1u8; 32],
        evidence_spec: [2u8; 32],
        staker_count: 0,
        bump: 254,
    }
}

#[test]
fn subaccord_round_trips() {
    let s = sample_subaccord();
    let decoded = round_trip(&s);
    assert_eq!(decoded.staking_token, s.staking_token);
    assert_eq!(decoded.alpha_bps, 1_000);
    assert_eq!(decoded.max_appeals, 3);
    assert_eq!(decoded.authority, Pubkey::default());
}

#[test]
fn juror_stake_round_trips() {
    let j = JurorStake {
        subaccord: Pubkey::new_unique(),
        juror: Pubkey::new_unique(),
        amount: 5_000,
        active_draws: 2,
        bump: 253,
    };
    let decoded = round_trip(&j);
    assert_eq!(decoded.amount, 5_000);
    assert_eq!(decoded.active_draws, 2);
}

#[test]
fn dispute_state_round_trips_and_progresses() {
    let d = Dispute {
        subaccord: Pubkey::new_unique(),
        filer: Pubkey::new_unique(),
        nonce: 7,
        num_options: 2,
        options: [[0u8; 32]; MAX_OPTIONS],
        evidence_hash: [9u8; 32],
        state: DisputeState::Created,
        current_round: 0,
        final_ruling: None,
        fee_paid: 3_000_000,
        bump: 252,
    };
    let decoded = round_trip(&d);
    assert_eq!(decoded.state, DisputeState::Created);
    assert_eq!(decoded.final_ruling, None);

    // state machine: every variant must round-trip (catches enum drift)
    for s in [
        DisputeState::Created,
        DisputeState::SnapshotPosted,
        DisputeState::Drawn,
        DisputeState::Review,
        DisputeState::Commit,
        DisputeState::Reveal,
        DisputeState::RoundResolved,
        DisputeState::Final,
        DisputeState::Closed,
    ] {
        let mut b = Vec::new();
        s.serialize(&mut b).unwrap();
        let back = DisputeState::deserialize(&mut b.as_slice()).unwrap();
        assert_eq!(back, s);
    }
}

#[test]
fn round_fits_max_jurors() {
    assert_eq!(MAX_JURORS, 31); // 3 -> 7 -> 15 -> 31 (3rd appeal)
    let r = Round {
        round_idx: 0,
        juror_count: 3,
        commit_count: 0,
        reveal_count: 0,
        review_end: 0,
        commit_end: 0,
        reveal_end: 0,
        result: u8::MAX,
        bump: 251,
        _pad0: [0; 2],
        dispute: Pubkey::new_unique(),
        jurors: [Pubkey::default(); MAX_JURORS],
        commits: [[0u8; 32]; MAX_JURORS],
        reveals: [u8::MAX; MAX_JURORS],
        _pad1: [0; 5],
    };
    // zero-copy Round is Copy; verify field access works
    assert_eq!(r.jurors.len(), MAX_JURORS);
    assert_eq!(r.commits.len(), MAX_JURORS);
    assert_eq!(r.result, u8::MAX);
}

#[test]
fn snapshot_round_trips() {
    let s = Snapshot {
        dispute: Pubkey::new_unique(),
        round_idx: 0,
        merkle_root: [42u8; 32],
        poster: Pubkey::new_unique(),
        bond: 1_000_000,
        challenge_deadline: 1_700_000_000 + 86_400, // fixed ts; host tests have no Clock
        status: SnapshotStatus::Posted,
        bump: 250,
    };
    let decoded = round_trip(&s);
    assert_eq!(decoded.status, SnapshotStatus::Posted);
    assert_eq!(decoded.merkle_root, [42u8; 32]);
}

#[test]
fn pending_update_payload_variants_round_trip() {
    let payloads = [
        UpdatePayload::MinStake(2_000),
        UpdatePayload::JurorsPerDispute(7),
        UpdatePayload::AlphaBps(1_500),
        UpdatePayload::ReviewWindow(100),
        UpdatePayload::CommitWindow(200),
        UpdatePayload::RevealWindow(300),
        UpdatePayload::MaxAppeals(5),
        UpdatePayload::FeePerJuror(2_000_000),
        UpdatePayload::Authority(Pubkey::new_unique()),
        UpdatePayload::EvidenceOperator(Pubkey::new_unique()),
    ];
    for p in payloads {
        let mut b = Vec::new();
        p.serialize(&mut b).unwrap();
        let back = UpdatePayload::deserialize(&mut b.as_slice()).unwrap();
        assert_eq!(back, p);
    }

    let u = PendingUpdate {
        subaccord: Pubkey::new_unique(),
        nonce: 1,
        proposed: UpdatePayload::MinStake(2_000),
        proposed_by: Pubkey::new_unique(),
        execute_after_slot: 100_000,
        bump: 249,
    };
    let decoded = round_trip(&u);
    assert_eq!(decoded.execute_after_slot, 100_000);
    assert_eq!(decoded.proposed, UpdatePayload::MinStake(2_000));
}

/// PDA seeds must derive deterministically and match the SPEC seed table.
#[test]
fn pda_seeds_are_deterministic() {
    let program_id = accord::ID;
    let creator = Pubkey::new_unique();
    let risk_type = [1u8; 32];

    let (subaccord_a, bump_a) = Pubkey::find_program_address(
        &[b"subaccord", creator.as_ref(), risk_type.as_ref()],
        &program_id,
    );
    let (subaccord_b, bump_b) = Pubkey::find_program_address(
        &[b"subaccord", creator.as_ref(), risk_type.as_ref()],
        &program_id,
    );
    assert_eq!(subaccord_a, subaccord_b);
    assert_eq!(bump_a, bump_b);
    assert_ne!(subaccord_a, creator);

    // same creator, different risk_type => different PDA (no namespace collision)
    let (other, _) = Pubkey::find_program_address(
        &[b"subaccord", creator.as_ref(), [9u8; 32].as_ref()],
        &program_id,
    );
    assert_ne!(subaccord_a, other);
}

#[test]
fn constants_match_spec() {
    assert_eq!(MAX_JURORS, 31); // 3 -> 7 -> 15 -> 31 (3rd appeal)
    assert!(MAX_OPTIONS.is_power_of_two() && MAX_OPTIONS >= 2);
}
