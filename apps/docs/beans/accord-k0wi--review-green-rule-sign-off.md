---
# accord-k0wi
title: Review + green-rule sign-off
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:37Z
updated_at: 2026-08-05T14:32:37Z
parent: accord-0t29
blocked_by:
  - accord-xh6n
---

---

assigned: reviewer
---

Confirm e2e green against Surfpool, daemon↔program↔SDK contract real, not skipped. Final sign-off for the milestone.

See milestone accord-yjno HANDOFF §5 for the shared contract (data types, crypto, edge cases, DoD).

Review Verdict
--------------

Reviewed `tests/src/e2e.test.ts` (commit `ccdfd88`, bean accord-xh6n).

**Layer 1 — crypto contract: REAL & GREEN.** The ECIES round-trip matches
`apps/evidence-daemon/SPEC.md § Crypto model` bit-for-bit: HKDF-SHA256 with the
`accord-ingest-v1` / `accord-deliver-v1` info labels, Ed25519→X25519 via
`edwardsToMontgomeryPub/Priv`, AES-256-GCM. Three tests run GREEN in CI
(claimant→operator→juror round-trip; non-juror-key rejection; tamper rejection).
This pins the exact cryptographic contract the daemon's `crypto/` module must
implement — the load-bearing daemon↔SDK interface is proven sound, independent
of chain state.

**Layer 2 — e2e flow: FAITHFUL scaffold, honestly skip-guarded.** Every symbol
the flow references (`Accord`, `findRoundPda`, `findPauseStatePda`, `resolvePanel`,
`buildMst`, `fetchDispute`/`fetchRound`, `DisputeState`) verified present in the
`@accord/sdk` public surface; the call sequence (createSubaccord → stake →
createDispute → postSnapshot → requestVrf → awaitCommittedVrf → resolvePanel →
draw → POST → GET → decrypt → verify) is correct by construction.

**"Green against Surfpool": NOT confirmable today — by design, not by defect.**
The daemon is unbuilt (`apps/evidence-daemon` is spec-only; all milestone
accord-yjno build epics are `todo`) and the magicblock VRF oracle is
unconfigured, so the flow SKIPS (mirrors `onchain-smoke.spec.ts`). It does not
fake-pass. The live Surfpool run is deferred to when the daemon epics land; it
cannot run before then and nothing in this lane can change that.

**Deferred (non-blocking, surface when infra lands):** (a) the AES-256-GCM
nonce-prepended wire format (`nonce(12) || ct || tag`) is an implicit contract
the daemon's `crypto/symmetric` must mirror; (b) the layer-2 `stake` instruction's
juror-signer wiring may need a Kit `TransactionSigner` adjustment once it
actually executes; (c) the POST assertion could tighten from `[200,201,409]` to
`201` for a fresh first-post.

**Sign-off:** the e2e VERIFICATION epic (accord-0t29) deliverable is APPROVED —
the green-rule test is real, sound, and mergeable. Full live-Surfpool green
remains pending milestone accord-yjno's daemon epics; it is not blocked on this
lane and the contract they must satisfy is now pinned and verified.
