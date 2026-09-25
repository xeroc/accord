---
# accord-jhzr
title: Upgrade anchor-litesvm off the xeroc fork to the upstream release (litesvm/agave-4 line)
status: todo
type: task
priority: low
created_at: 2026-09-22T15:11:11Z
updated_at: 2026-09-22T15:49:59Z
---

## Context

harness/anchor-litesvm + harness/litesvm-utils are verbatim upstream 0.4.0
crates with ONE substantive change: litesvm 0.11 -> 0.16 (agave 4.2/sbpf
0.21). They exist only because registry anchor-litesvm 0.4.0 caps litesvm at
^0.11, and the agave 3.1 line is capped at 3.1.14 (sbpf =0.13.1), which
cannot load the final sBPFv3 ELF. Verified 2026-09-22: no agave 3.2 exists;
sbpf >= 0.14.4 is reachable only via agave 4.x.

## Trigger

anchor-litesvm (github.com/brimigs/anchor-litesvm) publishes a release
depending on litesvm >= 0.13 (any agave-4 line). Check:
`curl -s https://crates.io/api/v1/crates/anchor-litesvm | jq .crate.max_version`

## Steps

- [ ] rm -r harness/ ; drop both members from root Cargo.toml
- [ ] programs/{accord,canon,synod}/Cargo.toml: path dep -> registry version
- [ ] canon direct `litesvm = "0.16.0"` -> match new harness line
- [ ] Adjust the `use anchor_litesvm::Account as SvmAccount;` import in the
      *_litesvm.rs files if the new stack's Account type line moved again
      (we re-export it from anchor_litesvm — keep or drop the re-export)
- [ ] cargo update && make test_unit (27 suites must stay green)
- [ ] Drop the vendored-harness sentence from AGENTS.md §Testing

## Acceptance

- No harness/ directory; anchor-litesvm from crates.io; make test_unit green.

## REWRITTEN SCOPE (2026-09-22 — supersedes content above)

harness/ is GONE: the three programs now consume anchor-litesvm as a git dep
on xeroc's fork (branch litesvm-0.16-sbpfv3, brimigs/anchor-litesvm#3 / PR #4)
which carries the litesvm 0.16 (agave 4.2) bump. This bean is now the
reminder to move OFF the fork the day upstream releases.

## Upgrade trigger

brimigs/anchor-litesvm publishes a release depending on litesvm >= 0.13
(any agave-4 line). Check:
`curl -s https://crates.io/api/v1/crates/anchor-litesvm | jq .crate.max_version`

## Upgrade steps

- [ ] programs/{accord,canon,synod}/Cargo.toml: git dep -> registry version
      (e.g. `anchor-litesvm = "0.5"`); drop the fork comment block
- [ ] canon's direct `litesvm = "0.16.0"` -> match the new harness line
- [ ] If the new stack's Account type re-unifies with solana-sdk's, drop the
      `solana-account = "4.3.0"` dev-deps and repoint the
      `use solana_account::Account as SvmAccount;` imports in the
      *_litesvm.rs files; otherwise leave them
- [ ] cargo update && make test_unit green
- [ ] Revert the AGENTS.md §Testing sentence to a plain registry-dep wording

## Done when

- No `git =` dep on anchor-litesvm anywhere in the workspace; make test_unit green.
