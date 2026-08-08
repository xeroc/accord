---
# accord-wuzs
title: Honest trust / positioning profile (CONCEPT-REVIEW Ugly 8)
status: completed
type: task
priority: normal
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T20:10:03Z
parent: accord-ukqg
---

## Why

Critical power and liveness are distributed among several privileged or
economically concentrated roles: the Subaccord authority (rule changes), the Squads
multisig (pause + upgrade), the off-chain indexer (proposed juror population), a
wealthy challenger class, the external VRF provider (randomness availability), the
cranker (draw advancement), large stakeholders (selection dominance), the trusted
evidence operator, and the integrating application (whether the ruling is honored).
None individually invalidates the project, but together they make "decentralized
court" / "Kleros of Solana" an overstatement. CONCEPT-REVIEW §Ugly 8.

## How (agreed — docs, not program code)

Publish a per-Subaccord machine-readable **trust profile**: authority, juror
admission model (key-level pseudonymous — not independent humans), stake
concentration metric, snapshot-poster model, randomness dependencies, evidence
operator, security value ceiling, and enforcement boundary (oracle output, not
self-enforcing). Qualify all product/README claims. Accurate one-liner:

> A configurable, capital-weighted Schelling arbitration oracle with optimistic
> off-chain juror indexing, externally supplied randomness, trusted
> confidential-evidence delivery, temporary privileged governance, and
> application-level enforcement.

## Acceptance (docs; no unit tests)

- Trust-profile spec doc under `apps/docs`.
- All README / docs / ADR claims about decentralization are qualified.
- ADR-0007 and ADR-0009 state their residual trust assumptions plainly.

## References

CONCEPT-REVIEW §Ugly 8; ADR-0001; `CONTEXT.md`.

## Summary of Changes

Docs-only (no program code, no unit tests per acceptance).

**New doc** — `apps/docs/docs/security/trust-profile.md`: the per-Subaccord
trust profile. States the honest one-liner, a claim-vs-reality table
("decentralized court" → "capital-weighted Schelling arbitration oracle", etc.),
a 9-row trust surface (Subaccord authority, upgrade multisig, indexer, VRF
provider, cranker, large stakeholders, evidence operator, integrating app,
juror admission), a machine-readable YAML profile (authority, juror_admission,
stake_concentration, randomness, evidence_operator, enforcement,
security_value_ceiling), the cheapest-rational-capture math (stake majority +
bribery), what is genuinely decentralized, the v2 roadmap, and a claim-writing
style guide.

**Qualified claims** across all product/marketing surfaces:

- `README.md` — "Kleros of Solana" → "inspired by Kleros"; added IMPORTANT
  callout pointing to the Trust Profile; "no central authority picks judges" →
  "honest-majority-stake assumed"; "prohibitively expensive" → "deterred, not
  impossible"; ADR-0011/0012 added to the ADR list; fixed 5 collapsed GitHub
  admonitions so the qualification callouts render.
- `PROJECT.md` — "decentralized arbitration accord" → "arbitration oracle";
  added honest-positioning blockquote; "Kleros of Solana" → "inspired by Kleros,
  not a port".
- `BRAND.md` — "resolution without trust" → "resolution with far fewer trusted
  humans".
- `apps/docs/docs/index.md` — title + key-features qualified; Trust Profile
  linked.
- `apps/landing/.../Layout.astro` — "Trustless" → "Trust-minimized"; "Capture
  is structurally impossible" → "Capture is deterred, not impossible".

**ADR residual-trust sections** (acceptance criterion 3):

- ADR-0007 — "Residual trust assumptions": multisig trusted with code,
  "sufficiently audited" is human judgment, freeze irrevocable, pause instant,
  no on-chain identity.
- ADR-0009 — "Residual trust assumptions": randomness availability
  provider-dependent, brute-force only partially closed, stake-weighting ≠
  stake-independence, honest-majority-stake load-bearing, distinct keys ≠
  independent humans, snapshot layer superseded by ADR-0012.

**Nav**: `mkdocs.yml` + `security/index.md` wire the Trust Profile into the
site (listed first under Security); ADR-0011/0012 added to the nav.

**Bug fixes picked up during review**: 5 collapsed `> [!TYPE] > content`
admonitions in README (would not render as GitHub alerts); a stray `>` mid-quote
in the snapshot-poster note of trust-profile.md; a broken
`../../CONCEPT-REVIEW.md` link (file not in repo) downgraded to a plain-text
reference.

Verified: all internal `.md` links resolve; all mkdocs nav entries exist; no
remaining unqualified "trustless"/"decentralized court"/"no central authority"
claims in product-facing docs.
