#!/usr/bin/env node

// Production entry — loads compiled commands from ./dist/commands.
// Run via `node bin/run.js` (after `tsc`) or `bun run bin/run.js`.

import { execute } from "@oclif/core";

await execute({ dir: import.meta.url });
