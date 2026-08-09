# Arbitrable Interface

Two CPI calls. The Accord never knows your program's domain.

## 1. File a dispute

```rust
use accord::cpi::accounts::CreateDispute as AccordCreateDispute;
use anchor_lang::solana_program::pubkey::Pubkey;

// fee MUST equal INITIAL_NUM_JURORS (3) * subaccord.fee_per_juror.
//   round-1 panel is the fixed protocol constant (ADR-0019), not a Subaccord field.
let required_fee = (3u64)
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
    evidence_hash,   // [u8; 32], ADR-0006 commitment → stored at dispute.evidence_hashes[0]
    nonce,           // u64, caller-chosen for PDA uniqueness
    required_fee,    // u64, exact match required
)?;
// dispute PDA = ["dispute", filer, nonce]
```

`evidence_hash` is the round-0 commitment — the filer's evidence package
([ADR-0006](../adr/0006-evidence-onchain-hash-trusted-re-encryption-operator.md),
[ADR-0017](../adr/0017-evidence-data-format-manifest-yaml.md)). Appeals may add per-round
hashes into `dispute.evidence_hashes[1..=MAX_APPEALS]` ([ADR-0023](../adr/0023-per-round-evidence-hashes.md));
the Arbitrable does not pass those — `appeal` does.

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
fee_round_0 = INITIAL_NUM_JURORS × fee_per_juror   // round-1 panel = 3 (ADR-0019)
fee_round_k = panel_k × fee_per_juror     // appeal rounds; see appeals.md
```

TypeScript: see [SDK](../sdk.md). Finality = `terms.appeal_window` (per-Subaccord, [ADR-0022](../adr/0022-per-subaccord-configurable-appeal-window.md)) after the last round's `reveal_end` ([state machine](../reference/state-machine.md)). Why two calls: [ADR-0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md).
