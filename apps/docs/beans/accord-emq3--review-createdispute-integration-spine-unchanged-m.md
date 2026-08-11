---
# accord-emq3
title: "Review: CreateDispute integration — spine unchanged, manual mode intact"
status: completed
type: task
priority: normal
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T03:58:00Z
parent: accord-1696
blocked_by:
  - accord-f76k
---

Confirm the createDispute/sendInstruction spine (L145-166) is byte-unchanged except options/evidenceHash source; manual mode behaves exactly as today. See HANDOFF §3/§5.

## Summary of Changes

### Review result: PASS

**Spine comparison (original L144-167 vs current):**

| Element                | Original                                                              | Current                | Changed?                     |
| ---------------------- | --------------------------------------------------------------------- | ---------------------- | ---------------------------- |
| `new Accord(...)`      | `endpoint: crpc.endpoint, signer`                                     | same                   | No                           |
| Accounts block         | `filer, subaccord, feeToken, filerTokenAccount, feeVault, pauseState` | same                   | No                           |
| `options`              | `validOpts.map(hexToBytes32)`                                         | `resolvedOptions`      | Source only (mode-dependent) |
| `evidenceHash`         | `hexToBytes32(evidenceHash)`                                          | `resolvedEvidenceHash` | Source only (mode-dependent) |
| `nonce`                | `BigInt(nonce)`                                                       | same                   | No                           |
| `fee`                  | `fee`                                                                 | same                   | No                           |
| `sendInstruction(...)` | `crpc.rpc, crpc.rpcSubscriptions, signer, instruction`                | same                   | No                           |

The spine is **structurally identical**. The only variable is where `options`/`evidenceHash` values come from — resolved by mode in a pre-spine branch.

**Manual mode regression check:**

In manual mode, `resolvedOptions = validOpts.map(hexToBytes32)` and `resolvedEvidenceHash = hexToBytes32(evidenceHash)` — the exact same expressions as the original. The format-mode derive/verify block (`if (mode === "format" && manifest && formatOutput)`) and the publish block (`if (mode === "format" && manifest)`) are both skipped. `navigate(...)` runs in the same position.

Manual mode UI (option hash inputs, evidence hash input) is preserved verbatim in the `mode === "manual"` conditional branch. The `canSubmit` logic gates manual mode with the same conditions as the original (`validOptions.length >= MIN_OPTIONS`, `isValidHex32(evidenceHash)`).

**No code changes needed — review confirmed the implementation is correct.**
