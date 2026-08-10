#!/usr/bin/env -S node --loader ts-node/esm --no-warnings=ExperimentalWarning

// Development entry — loads TypeScript commands directly from ./src/commands.
//   - bun (preferred in this repo): `bun run bin/dev.js ...`
//   - node: the shebang registers ts-node/esm; or use `tsx`.
//
// `development: true` tells oclif to remap the configured `dist/commands` to
// `src/commands` and load the `.ts` sources.

import { execute } from "@oclif/core";

await execute({ development: true, dir: import.meta.url });
