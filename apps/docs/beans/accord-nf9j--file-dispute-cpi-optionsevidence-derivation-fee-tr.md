---
# accord-nf9j
title: file_dispute CPI — options/evidence derivation + fee transfer (TDD)
status: todo
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T05:28:20Z
parent: accord-l2ad
blocked_by:
    - accord-ubmq
---

assigned: implementer
Full roster gate (early lock, no deadline wait), check-and-set Opening→Live. options[i]=H("synod-opt"‖case_pda‖i), options[N]=neutral at highest index; evidence_hash[0]=H(case_pda‖evidence[0..N]). CPI accord create_dispute with case PDA as filer signer (invoke_signed, seeds ["case",opener,nonce]) and case vault ATA as filer_token_account; nonce 0; fee from vault (vault == N*S−fee after). Bind dispute PDA field. Tests: CPI account-set mirror of canon challenge_item, double-file rejection, vault invariant, 7-party options len == 8, hash derivation vectors.
