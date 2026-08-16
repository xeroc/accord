---
# accord-38ek
title: Split accord lib.rs into per-instruction modules
status: completed
type: task
priority: normal
created_at: 2026-08-15T19:21:07Z
updated_at: 2026-08-15T20:52:07Z
---

Restructure programs/accord/src: instruction handlers + Accounts contexts into instructions/<ix>.rs (29 files), helpers into utils.rs, SAS credential gating into attestation.rs, host unit tests into tests.rs, layout byte-offsets into constants.rs. lib.rs keeps thin #[program] wrappers (IDL docs + signatures). Verified: 110 Rust tests, 64 e2e (1 env-skip: evidence daemon), IDL byte-identical.

## Clippy sweep

All 26 clippy warnings resolved: needless borrows (7), x-1>= rewrites (3), needless casts (2), manual RangeInclusive::contains, ==false, manual is_multiple_of (3, host tests only), unused imports, needless_range_loop (2, iter().enumerate()), doc list indent, duplicated cfg attr in pause_litesvm, dead empty_tree_root helper, unread Env.creator field. cargo clippy --all-targets clean on default/no-entrypoint/cpi; 110 Rust tests + 64 e2e green; IDL byte-identical.

## Handler impl refactor (round 2)

Per user direction: dropped the 29+29 __client_accounts/__cpi_client_accounts root re-exports; instructions/mod.rs re-exports each module via glob (pub use x::_;) which carries structs AND anchor's generated __client_accounts__ modules to the crate root through the chain. Handlers are now associated fns: impl<'info> Struct<'info> { pub fn handler_<ix>(ctx, ...) }. Instruction files import crate modules directly (use crate::{constants::_, errors::AccordError, events::_, state::_}; + prelude; utils/attestation where used). Root keeps pub use state::_ — required: anchor codegen emits 'use self::accord::*;' at crate root for its copied handler signatures, so arg types (MSTNode, CreateSubaccordParams, UpdatePayload, JurorMembership) must resolve from root. Verified: clippy 0 on default/no-entrypoint/cpi/all-targets, 110 Rust tests, 64 e2e, IDL byte-identical.
