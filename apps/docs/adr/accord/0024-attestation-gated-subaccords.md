# Attestation-gated Subaccords — optional SAS credential gate

> **Status:** Accepted / Implemented (`PROG-ATTESTTION`; shipped in
> `programs/accord/src/lib.rs`, `state.rs`, `errors.rs`).

A Subaccord may require every Juror to hold a valid **Solana Attestation Service
(SAS)** attestation to stake and be drawn. The gate is **optional and immutable**:
two new `Subaccord` fields — `juror_credential` and `juror_schema` — bind the pool
to a credential/schema pair at `create_subaccord`. Both `Pubkey::default()` ⇒
stake-only (today's behavior, unchanged). Both set (both-or-neither) ⇒ the
Accord reads the juror's SAS `Attestation` account as read-only proof on `stake`
and `draw_seat`. The fields join `domain_ref` + `evidence_spec` as the immutable
identity set; they are absent from `UpdatePayload`, so a pool's gate can never be
tightened, loosened, or removed by the 48h timelock.

An expired credential would otherwise leave a dead juror in the accumulator that
stalls the draw, so a permissionless `prune_juror` crank evicts jurors whose
attestation has actually expired. `expiry == 0` means "never expires" and is
never prunable.

## Context

A stake-weighted draw selects purely on capital — anyone with `≥ min_stake` may
sit on a panel. Some dispute classes want a tighter juror pool: a credential
(knowledge-of-ACME-policy, an on-chain reputation, a residency attestation) that
capital alone does not prove. The minimal, non-trustless-creep way to add that is
to bind the pool to an external, on-chain-verifiable credential rather than to
invent an Accord-native identity registry.

SAS (the Solana Attestation Service) already records credential-to-wallet
bindings as on-chain `Attestation` accounts owned by its program. The Accord can
read those accounts without trusting the issuer: it checks the account's owner
(the SAS program), discriminator, the credential/schema it was issued under, the
subject wallet, and the expiry. This mirrors the existing Evidence Operator model
(ADR-0006): an explicit, off-chain trusted party (here the **Credential
Authority**) whose judgment the Accord never substitutes for — it only enforces
the binding a Subaccord opts into. The Credential Authority is a peer of the
Evidence Operator: one controls evidence delivery, the other controls panel
eligibility.

The gate is an **extension, not a replacement** of the Schelling stake incentive.
Jurors still stake, are still drawn stake-weighted, and are still slashed for
incoherence; the credential only filters _who may enter the pool_. A pool that
wants no gate sets both fields to `default()` and is byte-for-byte today's
behavior.

## Decision

1. **`Subaccord.juror_credential` / `juror_schema: Pubkey`** are added as an
   immutable credential binding. Set at `create_subaccord` (via
   `CreateSubaccordParams`); absent from `UpdatePayload`, so the 48h authority
   timelock (ADR-0005) cannot mutate them. Both `default()` ⇒ stake-only; both
   set ⇒ gated. They join `domain_ref` + `evidence_spec` as the immutable identity
   set on the account.

2. **Both-or-neither at creation.** `create_subaccord` rejects a half-bound pool
   (`(credential == default) == (schema == default)`, else
   `AttestationBindingPartial`). A pool is either fully stake-only or fully
   gated — no ambiguous middle.

3. **`stake` validates the attestation against the binding.** On a gated pool
   the juror supplies their SAS attestation in `remaining_accounts[0]`. The
   handler checks owner, discriminator, credential, schema, and that the subject
   wallet (`data[0..32]`) is the juror. The expiry must be `0` (never expires) or
   outlive the maximum dispute lifecycle horizon
   `(review + commit + reveal + appeal) × (max_appeals + 1)` so the credential
   cannot lapse mid-dispute. `expiry == 0` ⇒ never expires and always passes the
   freshness check. Stake-only pools skip the block entirely.

4. **`draw_seat` re-checks the attestation (defense-in-depth).** The
   `subaccord` account is now passed (read-only, constraint-bound to the
   dispute); on gated pools the juror's attestation rides in
   `remaining_accounts[1]` (the `JurorStake` stays at `remaining_accounts[0]`).
   The draw-time check is the cheaper `expiry == 0 || expiry > now` — the
   stake-time horizon gate already bounded entry. This catches the race where a
   credential expires between prune-eligible and prune-called.

5. **`prune_juror` is a permissionless crank for liveness.** Without it, an
   expired juror left in the tree is a dead zone: if the VRF lands on them,
   `draw_seat` reverts at the freshness check and the cranker cannot advance the
   round. `prune_juror` evicts such a juror: the caller (any signer) supplies the
   juror's Merkle path + the expired attestation in `remaining_accounts[0]`; the
   juror does NOT sign (the `JurorStake` PDA is seeded off the passed juror).
   The body mirrors `request_withdraw` for the **full** `staked` — zeros the
   leaf's selection weight, recomputes the root, banks the tokens into
   `pending_withdrawal`, decrements `staker_count` — so the evicted juror
   completes the normal two-phase `withdraw` (or re-stakes with a renewed
   attestation).

6. **`expiry != 0 && expiry <= now` is the prune precondition.** A
   never-expiring credential (`expiry == 0`) can never be pruned
   (`AttestationNotExpired`). Banking the full stake requires no outstanding
   `slash_reserve` (⇔ no in-flight draws), so a drawn juror settles those first
   (the same discipline as `request_withdraw`).

7. **The SAS layout is parsed by a dynamic-offset reader.** SAS `Attestation`
   accounts have a variable-length `data` blob; `expiry` sits _after_ it plus the
   signer, so its offset is **not** a compile-time constant. The fixed-offset
   fields (`credential`, `schema`, the `data[0..32]` wallet) reuse the named-offset
   idiom of the program's own `layout` mod, but `expiry` is located at
   `DATA_OFF + data_len + SIGNER_W` and read at runtime. The parser is
   unit-tested across `data_len` values (the SAS analog of
   `layout_tests::offsets_match_borsh`).

8. **Trusted, not trustless.** The Accord verifies the on-chain binding
   (owner/discriminator/credential/schema/wallet/expiry) but never the Credential
   Authority's judgment. The trust model is the same shape as ADR-0006's Evidence
   Operator: an explicit off-chain party the Subaccord designates, with no
   on-chain crypto substituting for its role. A Subaccord that does not want that
   dependency stays stake-only.

## Considered Options

**Where the gate state lives.**

- **On the `Subaccord`, immutable (chosen).** Two `Pubkey` fields, set once at
  creation, absent from `UpdatePayload`. Cheap, fixed-size, and the gate cannot
  be silently tightened/loosened by the authority mid-life — a juror who staked
  under a gate keeps that gate for the pool's life.

- **Mutable via the 48h timelock (status quo for other params).** Rejected — a
  pool that could loosen its gate after attracting stake under a stricter one is
  a bait-and-switch on every already-staked juror. Immutability is the
  no-surprise property; the identity triplet (`domain_ref`/`evidence_spec`) is
  already immutable for the same reason.

- **A separate gating program / registry.** Rejected — invents a parallel
  identity registry when SAS already records the bindings on-chain. The Accord
  should read credentials, not issue them.

**One credential field vs a credential/schema pair.**

- **Pair `(credential, schema)` (chosen).** SAS issues attestations under a
  `(credential, schema)` pair; binding both is how the pool pins the exact
  attestation type it trusts. One field alone is ambiguous about which schema
  counts.

- **Single field.** Rejected — would force the Accord to accept any schema under
  the credential, widening the gate beyond what the pool intended.

**How to handle expiry / liveness.**

- **Horizon gate at stake + freshness re-check at draw + prune crank (chosen).**
  Three layers: stake-time ensures the credential outlives the longest possible
  dispute so it can't lapse mid-case; draw-time catches the prune-eligible→pruned
  race; the prune crank removes dead jurors so the draw never lands on one. Each
  is cheap (one attestation read + one timestamp compare) and each covers a
  different window.

- **Stake-time gate only.** Rejected — a juror whose credential expires after
  staking stays in the accumulator forever; the VRF eventually lands on them and
  the draw stalls with no recovery.

- **Draw-time-only, no prune.** Rejected — `draw_seat` reverting on an expired
  juror would stall the round (the cranker cannot advance past a dead seat).
  The prune crank is what makes "expired ⇒ evicted" a livable invariant.

**Prune as its own instruction vs reusing `request_withdraw`.**

- **Own instruction `prune_juror` (chosen).** It mirrors `request_withdraw`'s
  body but the **signer differs**: the caller signs (permissionless), the juror
  does not. `RequestWithdraw` derives the `JurorStake` off a `Signer` juror, so
  the permissionless trigger needs its own account struct (`PruneJuror` with an
  `UncheckedAccount` juror).

- **Reuse `request_withdraw`.** Rejected — its account context requires the juror
  to sign, which a permissionless crank cannot satisfy.

## Consequences

- **`Subaccord` grows by 64 bytes** (2 × `Pubkey`). `Subaccord::INIT_SPACE` and
  the `8 + INIT_SPACE` rent at `create_subaccord` rise accordingly. The manual
  `layout` offset consts slice `JurorStake` / `AppealBond`, **not** `Subaccord`,
  so there is no layout-const drift; the `INIT_SPACE` compile-time assert and
  `layout_tests::offsets_match_borsh` still pass. Pre-deployment (greenfield): no
  on-chain migration.

- **`CreateSubaccordParams` gains `juror_credential` / `juror_schema`.** Breaking
  change to the instruction's args object; the IDL and SDK facade are
  regenerated. `UpdatePayload` is unchanged — the fields are deliberately absent
  (immutability).

- **`stake` / `draw_seat` read a variable-length external account.** The SAS
  attestation is a raw `AccountInfo` in `remaining_accounts`; the program parses
  it manually (owner check + the dynamic-offset `expiry` read). This couples the
  reader to the SAS on-wire layout, pinned by the `sas_layout::tests` unit tests
  across `data_len` values — the SAS analog of the program's own offset-pinning
  tests.

- **New permissionless crank in the surface.** `prune_juror` joins the other
  permissionless cranks (`finalize_round`, `settle_round`, `redraw`,
  `cancel_dispute`). Anyone may call it; the only precondition is an actually-
  expired credential, so griefing is impossible (a non-expired attestation
  reverts `AttestationNotExpired`). It never moves SPL tokens — banking is into
  `pending_withdrawal`; the juror's two-phase `withdraw` is unchanged.

- **Seven new error codes** (`AttestationMissing`, `AttestationBindingPartial`,
  `AttestationMalformed`, `AttestationMismatch`, `AttestationSubjectMismatch`,
  `AttestationExpired`, `AttestationNotExpired`) extend `AccordError`.

- **Trust positioning is explicit.** Like the Evidence Operator (ADR-0006), the
  Credential Authority is a trusted off-chain party the Subaccord designates. The
  Accord enforces the _binding_ (the on-chain attestation matches the pool's
  credential/schema and the juror's wallet), not the authority's _judgment_. A
  malicious or negligent authority can admit unqualified jurors — exactly as a
  negligent Evidence Operator can mis-deliver evidence. The mitigation is the
  same: pool creators pick their authority, and a pool that wants no such
  dependency stays stake-only.

- **`expiry == 0` is load-bearing.** It means "never expires": it always passes
  the stake-time horizon gate and the draw-time freshness check, and it can
  never be pruned. A pool that wants rotating credentials issues attestations
  with a real expiry and relies on the prune crank for liveness; one that wants
  permanent credentials issues `expiry == 0` attestations.

- **Amends ADR-0005** — `juror_credential`/`juror_schema` join `domain_ref` /
  `evidence_spec` as fields excluded from `UpdatePayload` (the immutable identity
  set on `Subaccord`). The timelock's mutability scope is unchanged for every
  other field.

## References

- `programs/accord/src/lib.rs` — `sas_layout` (dynamic-offset parser),
  `validate_sas_attestation`, `attestation_horizon`, `create_subaccord`
  (both-or-neither), `stake` (gate via `remaining_accounts[0]`), `draw_seat`
  (re-check via `remaining_accounts[1]`), `prune_juror`, `PruneJuror` account
  context.
- `programs/accord/src/state.rs` — `Subaccord.juror_credential` /
  `juror_schema`; `CreateSubaccordParams` pair.
- `programs/accord/src/errors.rs` — the seven `Attestation*` variants.
- ADR-0005 — Subaccord authority + 48h timelock; amended here (the credential
  binding is excluded from `UpdatePayload`).
- ADR-0006 — evidence model (on-chain hash, trusted operator); the Credential
  Authority is the structural peer of the Evidence Operator.
- ADR-0012 — on-chain stake accumulator; `prune_juror` and `request_withdraw`
  both advance the canonical root.
- `CONTEXT.md` — Subaccord, Evidence Operator, Credential Authority, SAS,
  Attestation gate, `prune_juror`.
- `meta/specs/PROG-ATTESTTION.md` — original proposal (now implemented; its
  implementation change map is what shipped).
