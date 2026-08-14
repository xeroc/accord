---
# accord-isfo
title: Rename accord_pause_state to accord_state + mainnet checklist
status: in-progress
type: task
created_at: 2026-08-14T17:53:14Z
updated_at: 2026-08-14T17:53:14Z
---

Rename the identifier accord_pause_state -> accord_state. Discovery: it exists in exactly ONE place — programs/canon/src/instructions/challenge_item.rs as a local binding for remaining_accounts[1] (Accord PauseState passed to the create_dispute CPI) + 3 comment mentions. It is NOT a seed (real seed: SEED_PAUSE=b"pause", constants.rs:86), NOT an IDL/SDK surface — a local rename cannot break deployed code. Add a root-README 'Mainnet readiness' subsection under Deployment listing everything to re-evaluate before the first mainnet deploy (including the seed rename b"pause"->b"accord_state" which would move the PauseState PDA).
