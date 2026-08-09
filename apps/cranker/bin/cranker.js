#!/usr/bin/env bun

// Production entry — launches the cranker service via bun.
// Run as `cranker` (after `pnpm install` links the bin) or `bun run bin/cranker.js`.

await import("../src/index.ts");
