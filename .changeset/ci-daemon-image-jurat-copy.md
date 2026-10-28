---
"@useaccord/evidence-daemon": patch
"@useaccord/tests": patch
---

evidence-daemon image: the build stage never COPYed `apps/jurat`, but the daemon's trace tests import jurat's trace sink source (`bun-run, never emitted`) — the image typecheck failed TS2307. tests: fork tripwire in `createTestEnv` (refuse mainnet/devnet-forked Surfnets with a clear error) + crash-safety unpause guard in the pause spec so a mid-test failure can't leave the singleton paused and cascade `#6010 ProgramPaused` into every sibling spec.
