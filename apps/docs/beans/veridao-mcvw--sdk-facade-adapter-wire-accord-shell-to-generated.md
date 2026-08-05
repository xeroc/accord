---
# veridao-mcvw
title: SDK facade adapter — wire Accord shell to generated Codama client (seam impls)
status: todo
type: task
priority: high
created_at: 2026-08-05T00:32:06Z
updated_at: 2026-08-05T00:48:09Z
parent: veridao-5y8e
---

The Accord facade (packages/sdk/src/accord.ts) is a shell: it holds
rpc/signer/client but exposes NO chain-driving methods. Every src/methods/_.ts
module declares a typed seam (AccordDisputeClient, AccordLifecycleClient,
AccordVrfClient, AccordSnapshotClient, AccordStakingClient, AccordVotingClient,
AccordAppealClient) with method names like buildCreateDispute / fetchDispute,
and each says 'Foundation wires the concrete adapter'. No concrete adapter
exists (grep: zero implementors; seam names buildX != generated getXInstruction;
seam fetchers return minimal shaped views vs generated full-account decoders).
So the facade cannot drive any instruction end-to-end. Deliverable: a concrete
adapter implementing every seam against the generated Codama client
(getXxxInstruction builders) + packages/sdk/src/fetch.ts, surfaced as Accord
methods or a single wired client. Unblocks the jest integration suite
(veridao-7iiv). Sources of truth: ADR-0010; packages/sdk/src/accord.ts;
packages/sdk/src/methods/_.ts (seam interfaces);
packages/sdk/src/generated/programs/accord.ts (generated surface).
