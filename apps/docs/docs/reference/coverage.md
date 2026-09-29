# Test Coverage

> **Generated — do not hand-edit.** Regenerate with `make coverage`
> (`scripts/gen-coverage.sh`). A cell lists the test files whose source
> references the instruction symbol, so it is evidence of invocation, not
> a statement of branch coverage. `—` means no suite references the
> instruction by name (e.g. CPI callbacks driven through their oracle).

## accord

| Instruction | LiteSVM unit | Host unit | e2e spec |
| --- | --- | --- | --- |
| `appeal` | accumulator,min_jury_size | — | appeal,attestation,canon.challenge,dispute,full-lifecycle,scalar,sdk-pipeline |
| `cancel_dispute` | accumulator | — | canon.challenge,synod.claim,synod.full-lifecycle |
| `claim_appeal_refund` | accumulator | — | appeal |
| `claim_filing_bounty` | accumulator | — | appeal |
| `commit` | accumulator,min_jury_size | — | accumulator,appeal,attestation,canon.challenge,full-lifecycle,quorum-redraw,scalar,sdk-pipeline,synod.full-lifecycle,voting |
| `commit_vrf_callback` | accumulator | — | — |
| `create_dispute` | accumulator | — | accumulator,appeal,canon.challenge,canon,dispute,full-lifecycle,scalar,voting |
| `create_subaccord` | accumulator,attestation,min_jury_size,update | — | canon.challenge,full-lifecycle,lifecycle.subaccord |
| `draw_seat` | accumulator | — | accumulator,appeal,canon.challenge,draw,full-lifecycle,quorum-redraw,scalar,synod.full-lifecycle,voting |
| `execute_subaccord_update` | accumulator,update | — | canon.update |
| `execute_unpause` | pause | — | lifecycle.pause.timelock |
| `finalize_dispute` | accumulator | — | appeal,canon.challenge,full-lifecycle,scalar,synod.full-lifecycle |
| `finalize_round` | accumulator | — | appeal,canon.challenge,full-lifecycle,quorum-redraw,scalar,synod.full-lifecycle,voting |
| `get_ruling` | — | — | full-lifecycle |
| `health` | health | — | — |
| `initialize_pause` | — | — | — |
| `pause` | accumulator,attestation,min_jury_size,pause,reclaim,update | — | accumulator,appeal,attestation,dispute,evidence,full-lifecycle,lifecycle.pause.timelock,lifecycle.subaccord,quorum-redraw,reclaim,staking,voting |
| `propose_subaccord_update` | update | — | — |
| `propose_unpause` | pause | — | lifecycle.pause.timelock |
| `prune_juror` | attestation | — | attestation |
| `reclaim_slot` | attestation,reclaim | — | reclaim |
| `reconcile_stake` | accumulator | — | appeal |
| `redraw` | accumulator | — | canon.challenge,quorum-redraw |
| `request_vrf` | — | tests.rs | — |
| `request_withdraw` | accumulator,attestation,reclaim | — | reclaim |
| `reveal` | accumulator,min_jury_size | — | accumulator,appeal,attestation,canon.challenge,full-lifecycle,quorum-redraw,scalar,sdk-pipeline,synod.full-lifecycle,voting |
| `settle_round` | accumulator | — | draw |
| `stake` | accumulator,attestation,reclaim | tests.rs | accumulator,appeal,attestation,canon.challenge,canon,dispute,evidence,full-lifecycle,reclaim,scalar,sdk-pipeline,staking,synod.claim,synod.fixtures,synod.full-lifecycle,synod.open-join,voting |
| `withdraw` | accumulator,attestation,reclaim | — | accumulator,reclaim,sdk-pipeline,staking |
| `withdraw_fees` | accumulator | — | appeal |

## canon

| Instruction | LiteSVM unit | Host unit | e2e spec |
| --- | --- | --- | --- |
| `advance_pending` | advance_pending,withdrawal | — | canon |
| `advance_withdrawal` | close_item,withdrawal | — | canon |
| `challenge_item` | challenge_item,settle_item | — | canon.challenge |
| `close_item` | close_item | — | canon |
| `create_list` | create_list,submit_item,update | — | canon.challenge,canon,canon.update |
| `propose_court_update` | update | — | canon.update |
| `request_withdrawal` | withdrawal | — | canon |
| `settle_item` | close_item,settle_item | — | canon.challenge,canon |
| `submit_item` | advance_pending,challenge_item,submit_item,withdrawal | — | canon.challenge,canon |
| `update_list` | create_list,update | — | canon.update |

## synod

| Instruction | LiteSVM unit | Host unit | e2e spec |
| --- | --- | --- | --- |
| `claim` | payout | — | appeal,evidence,synod.claim,synod.fixtures,synod.full-lifecycle |
| `file_dispute` | file_dispute,join,payout | — | canon.challenge,synod.file,synod.fixtures,synod.full-lifecycle,synod.open-join |
| `join` | file_dispute,join,open_case,payout | — | attestation,synod.claim,synod.file,synod.fixtures,synod.full-lifecycle,synod.open-join |
| `open_case` | join,open_case,payout | — | synod.open-join |
| `refund_roster_miss` | payout | — | synod.refund |
