---
"@useaccord/sdk": patch
"@useaccord/canon": patch
"@useaccord/synod": patch
"@useaccord/cli": patch
---

Fix SDK facade client wiring: `accordProgram()` (and the Canon/Synod equivalents) received the raw RPC proxy where kit 7's program-client contract requires a `ClientWithRpc` — generated fetchers read `client.rpc`, which on the proxy is a fabricated JSON-RPC method-builder. Every facade-mediated account read (`awaitCommittedVrf`, `getRuling`, juror-stake + pending-update reads) failed with `rpc.getAccountInfo is not a function`. The facades now pass `{ rpc }`; regression test pins `client.rpc === facade.rpc`. Also adds `useaccord dispute:show <pda>` — the full interpreted on-chain Dispute view (state name, ISO timestamps, sentinel interpretation, frozen CaseTerms, aggregation-labeled ruling).
