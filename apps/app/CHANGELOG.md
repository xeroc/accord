# @useaccord/app

## 0.5.2

### Patch Changes

- [#18](https://github.com/xeroc/accord/pull/18) [`94db86a`](https://github.com/xeroc/accord/commit/94db86ad4775dfe3afd0eed49c2a699eb1e7c9df) Thanks [@xeroc](https://github.com/xeroc)! - Wire Plausible analytics (self-hosted at p.chainsquad.com, defer-loaded, domain-scoped) to the app and landing pages.
- Updated dependencies []:
  - @useaccord/sdk@0.5.2
  - @useaccord/ui@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.5.1
  - @useaccord/ui@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.5.0
  - @useaccord/ui@0.5.0

## 0.4.0

### Minor Changes

- [#12](https://github.com/xeroc/accord/pull/12) [`895cf9d`](https://github.com/xeroc/accord/commit/895cf9dcb67cbad3c3c1eeb9530a07b6837c49a4) Thanks [@xeroc](https://github.com/xeroc)! - evidence: daemon URL and operator pubkey follow the selected cluster, configurable per cluster via Vite env — `VITE_EVIDENCE_DAEMON_URL_{DEVNET,MAINNET,LOCALNET}` (defaults: `api.devnet.useaccord.xyz` for devnet, `api.useaccord.xyz` for mainnet, devnet's value for localnet) and `VITE_EVIDENCE_OPERATOR[_ADDRESS]_{DEVNET,MAINNET,LOCALNET}` (default: unset = no operator, localnet falls back to devnet's); replaces the single build-time `VITE_EVIDENCE_DAEMON_URL` / `VITE_EVIDENCE_OPERATOR[_ADDRESS]`

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.4.0
  - @useaccord/ui@0.4.0

## 0.3.1

### Patch Changes

- [#10](https://github.com/xeroc/accord/pull/10) [`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8) Thanks [@xeroc](https://github.com/xeroc)! - bump version number
- Updated dependencies [[`b15d559`](https://github.com/xeroc/accord/commit/b15d55995a9f457be4945a6bc047d8177e6634f8)]:
  - @useaccord/sdk@0.3.1
  - @useaccord/ui@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`6b5e6b8`](https://github.com/xeroc/accord/commit/6b5e6b8b2097f26c23820699802cb53afd28a990)]:
  - @useaccord/sdk@0.3.0
  - @useaccord/ui@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.2.1
  - @useaccord/ui@0.2.1

## 0.2.0

### Minor Changes

- intial changeset release

### Patch Changes

- Updated dependencies []:
  - @useaccord/sdk@0.2.0
  - @useaccord/ui@0.2.0
