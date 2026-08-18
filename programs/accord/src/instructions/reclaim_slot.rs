use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `reclaim_slot` (RECLAIM-LEAF). Permissionless — any
/// caller may trigger. No token accounts needed (pure ledger + root update).
/// Same shape as `ReconcileStake`.
#[derive(Accounts)]
pub struct ReclaimSlot<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
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

impl<'info> ReclaimSlot<'info> {
    pub fn handler_reclaim_slot(ctx: Context<ReclaimSlot>, path: Vec<MSTNode>) -> Result<()> {
        let js = &mut ctx.accounts.juror_stake;
        let sub = &mut ctx.accounts.subaccord;

        // Preconditions: fully drained. Double-reclaim is prevented by root
        // verification: after reclaim the leaf is (default, 0), but we hash
        // (js.juror, 0) as old_juror — a second reclaim fails InvalidMerklePath
        // because the root no longer contains (juror, 0) at this index.
        require!(js.staked == 0, AccordError::SlotNotDrained);
        require!(js.active_draws == 0, AccordError::SlotNotDrained);
        require!(js.stake_delta == 0, AccordError::SlotNotDrained);
        require!(js.fees_earned == 0, AccordError::SlotNotDrained);

        let juror = js.juror;
        let index = js.tree_index;

        // Root update: blank the leaf identity from (juror, 0) to (default, 0).
        // total_stake does not change (0 → 0). Only the root hash changes
        // (leaf hash input: H(juror ‖ 0) → H(default ‖ 0)).
        let (new_root, new_total) = verify_and_recompute(
            &juror,
            0,
            &Pubkey::default(),
            0,
            index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        // Linked-list push: this JurorStake becomes the new head.
        js.next_free = sub.free_head;
        sub.free_head = index;

        sub.root_hash = new_root;
        sub.total_stake = new_total;

        emit!(SlotReclaimed {
            subaccord: sub.key(),
            juror,
            index,
        });

        Ok(())
    }
}
