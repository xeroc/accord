---
# accord-7mkb
title: Commit/reveal voting UI (inline on dispute detail)
status: todo
type: task
priority: normal
created_at: 2026-08-07T23:09:16Z
updated_at: 2026-08-07T23:10:49Z
parent: accord-pbff
blocked_by:
    - accord-ewj8
---

Rendered inline on /disputes/:address when juror pubkey is in Round.jurors[]. Fetch round via findRoundPda + fetchRound. If state=Commit: show option index selector (0..numOptions-1) + auto-generate 32-byte salt. Call accord.methods.commit(accounts, {vote, salt}) — SDK computes sha256(vote||salt||juror). If state=Reveal: show reveal form with stored {vote, salt}. Call accord.methods.reveal(accounts, args). Store salt in localStorage keyed by dispute+round+juror (needed between commit and reveal).
