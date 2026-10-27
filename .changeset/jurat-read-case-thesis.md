---
"@useaccord/jurat": minor
---

Builtin `read_case` tool: Inveigo disputes now reach the juror with full context. The round-0 evidence bundle carries only the challenger's anti-thesis; `read_case` resolves the boss `Item` via the unique live `Item.current_dispute` link (one `getProgramAccounts` scan, discriminator + dispute memcmp — same cross-program pattern as `findSasAttestation`), fetches the ORIGINAL THESIS from the evidence CAS at `Item.claim_hash`, and gates on `sha256(bytes) === claim_hash` — a tampered or wrong document throws, so the agent only ever sees the on-chain-committed thesis. Returns `null` for non-Inveigo disputes; `checks.courtMatches` cross-checks `Item.subaccord` against the dispute's court. Offsets mirror inveigo `state.rs` and are drift-pinned by that repo's `tests.rs::layout_pins`. The default system prompt now tells the juror the tool is required context on Inveigo disputes (hold-vs-flip framing lives in the court's domain doc).
