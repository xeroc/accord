# Arbitrable Interface

Two CPI calls. The Accord never knows your program's domain.

## 1. File a dispute

```rust
use accord::cpi::accounts::CreateDispute as AccordCreateDispute;
use anchor_lang::solana_program::pubkey::Pubkey;

// fee MUST equal subaccord.jurors_per_dispute * subaccord.fee_per_juror.
let required_fee = (subaccord.jurors_per_dispute as u64)
    .checked_mul(subaccord.fee_per_juror)
    .unwrap();

accord::cpi::create_dispute(
    CpiContext::new(
        ctx.accounts.accord_program.to_account_info(),
        AccordCreateDispute {
            filer: ctx.accounts.filer.to_account_info(),
            subaccord: ctx.accounts.subaccord.to_account_info(),
            pause_state: ctx.accounts.pause_state.to_account_info(),
            dispute: ctx.accounts.dispute.to_account_info(),
            staking_token: ctx.accounts.staking_token.to_account_info(),
            filer_token_account: ctx.accounts.filer_token_account.to_account_info(),
            vault: ctx.accounts.vault.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
    ),
    options,         // Vec<[u8; 32]>, 2..=32 hashes
    evidence_hash,   // [u8; 32], ADR-0006 commitment
    nonce,           // u64, caller-chosen for PDA uniqueness
    required_fee,    // u64, exact match required
)?;
// dispute PDA = ["dispute", filer, nonce]
```

## 2. Read the ruling

```rust
// Returns None until the dispute reaches Final.
let ruling: Option<u8> = accord::cpi::get_ruling(
    CpiContext::new(
        ctx.accounts.accord_program.to_account_info(),
        accord::cpi::accounts::GetRuling {
            caller: ctx.accounts.caller.to_account_info(),
            dispute: ctx.accounts.dispute.to_account_info(),
        },
    ),
)?;
```

## Accounts the Arbitrable must pass

| Account                           | For                                                                    |
| --------------------------------- | ---------------------------------------------------------------------- |
| `subaccord`                       | pool config + vault authority                                          |
| `pause_state`                     | circuit-breaker check                                                  |
| `dispute`                         | `["dispute", filer, nonce]` (PDA init)                                 |
| `staking_token`                   | `== subaccord.staking_token`                                           |
| `filer_token_account`             | filer's ATA of `staking_token` (funds the fee)                         |
| `vault`                           | Subaccord-PDA-owned ATA (must exist; guaranteed if `staker_count ≥ N`) |
| `token_program`, `system_program` | runtime                                                                |

## Fee formula

```
fee_round_0 = jurors_per_dispute × fee_per_juror
fee_round_k = panel_k × fee_per_juror     // appeal rounds; see appeals.md
```

TypeScript: see [SDK](../sdk.md). Finality = `APPEAL_WINDOW_SECS` after the last round's `reveal_end` ([state machine](../reference/state-machine.md)). Why two calls: [ADR-0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md).
