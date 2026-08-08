---
# accord-03vz
title: Appeal action
status: todo
type: task
priority: normal
created_at: 2026-08-07T23:09:25Z
updated_at: 2026-08-07T23:10:49Z
parent: accord-sdtj
blocked_by:
    - accord-ewj8
---

On /disputes/:address when state=RoundResolved and within APPEAL_WINDOW_SECS. Appeal button → builds appeal instruction via accord.methods.appeal(accounts). Needs AppealBond PDA derivation. Posts bond (fee + bond = panel_size_for_round(next) * fee_per_juror + bond). After appeal: new round initiated by daemon.
