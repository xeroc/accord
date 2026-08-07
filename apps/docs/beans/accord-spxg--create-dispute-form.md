---
# accord-spxg
title: Create dispute form
status: todo
type: task
created_at: 2026-08-07T23:09:25Z
updated_at: 2026-08-07T23:09:25Z
parent: accord-sdtj
---

Controlled form at /disputes/new. Subaccord selector (address input or query param). On select: read subaccord feePerJuror, compute requiredFee = INITIAL_NUM_JURORS * feePerJuror. Option hashes: dynamic list of 32-byte hex inputs (2..=MAX_OPTIONS). Nonce (auto-increment or manual). evidenceHash defaults to [0;32]. On submit: derive dispute PDA, build createDispute instruction, optionally bundle requestVrf in same tx. sendInstruction, redirect to /disputes/:address.
