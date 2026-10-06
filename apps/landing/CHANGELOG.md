# @useaccord/landing

## 0.5.2

### Patch Changes

- [#18](https://github.com/xeroc/accord/pull/18) [`85be9db`](https://github.com/xeroc/accord/commit/85be9dbe22d3ed0427df2549eb21f754a01c2a43) Thanks [@xeroc](https://github.com/xeroc)! - Landing copy rewrite: removed the repeated generated-text patterns ("X — not Y" parallelism, "No X, no Y, no Z" stacks, orphan aphorisms) and fixed trust overclaims ("trustless" → "trust-minimized", "capture is structurally impossible" softened). Blurb-page and How-it-Rules copy aligned.

- [#18](https://github.com/xeroc/accord/pull/18) [`94db86a`](https://github.com/xeroc/accord/commit/94db86ad4775dfe3afd0eed49c2a699eb1e7c9df) Thanks [@xeroc](https://github.com/xeroc)! - Wire Plausible analytics (self-hosted at p.chainsquad.com, defer-loaded, domain-scoped) to the app and landing pages.
- Updated dependencies []:
  - @useaccord/ui@0.5.2

## 0.5.1

### Patch Changes

- [#16](https://github.com/xeroc/accord/pull/16) [`a45d64e`](https://github.com/xeroc/accord/commit/a45d64ed73dbeeac26e6e9989d31244d043f0075) Thanks [@xeroc](https://github.com/xeroc)! - Landing + blurb: launch the copy — Accord is live on mainnet (unaudited). Adds the mainnet launch thread to the blurb explainers; replaces every pre-launch / "v1 is the build target" claim across Nav, Audience, Heritage, Footer, the waitlist, and the blurb status line. No traction claims added.
- Updated dependencies []:
  - @useaccord/ui@0.5.1

## 0.5.0

### Minor Changes

- [#14](https://github.com/xeroc/accord/pull/14) [`958eb11`](https://github.com/xeroc/accord/commit/958eb113cdb40ef26ed07573c05a8cbb0b3b0cdd) Thanks [@xeroc](https://github.com/xeroc)! - add the unlisted /blurb route — copyable words (one-liner, short + standard blurb), a forwardable intro email, the founder's Accord explainer tweets with videos, team + track record, brand kit (mark SVGs, palette, type), and contact. Ported from the riprap blurb page structure, restyled onto the Accord tokens.

- [#14](https://github.com/xeroc/accord/pull/14) [`958eb11`](https://github.com/xeroc/accord/commit/958eb113cdb40ef26ed07573c05a8cbb0b3b0cdd) Thanks [@xeroc](https://github.com/xeroc)! - refactor the landing router to react-router HashRouter (the workspace convention for GH Pages): hash routes (#/, #/how-it-rules/:slug, #/blurb), Link-based internal nav, scroll-to-top and per-route document titles, unknown routes fall back home; legacy path URLs bounce to their hash route via 404.html.

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.4.0

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number
- Updated dependencies [[`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8)]:
  - @useaccord/ui@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.2.1

## 0.2.0

### Minor Changes

- intial changeset release

### Patch Changes

- Updated dependencies []:
  - @useaccord/ui@0.2.0
