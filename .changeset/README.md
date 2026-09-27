# Changesets

Every PR that changes shipped behavior (program semantics, SDK surface, app
behavior) adds a changeset here: run `pnpm changeset` at the repo root, pick
the bump, describe the change for the CHANGELOG. The file is consumed by the
release flow — see "Releases" in AGENTS.md.

The whole workspace versions in lockstep (`fixed` group in `config.json`) and
the shared number is mirrored into `[workspace.package].version` in the root
`Cargo.toml` (all three programs inherit it, and Anchor stamps it into the IDL
metadata). The root `package.json` itself is not managed by changesets — its
version is frozen and nothing consumes it.
