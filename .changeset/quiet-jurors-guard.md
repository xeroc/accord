---
"@useaccord/sdk": patch
"@useaccord/tests": patch
---

commit: reject the all-zero commitment sentinel (SR4-M-1, bean accord-wgk7)

- The all-zero slot doubles as the "uncommitted" sentinel (`CommitMissing` /
  `CommitAlreadyExists` gates), but `commit` accepted an all-zero SUBMISSION:
  a drawn juror could submit zeros repeatedly — each pass bumped
  `commit_count` while leaving the slot sentinel — drive the counter to panel
  size, flip the dispute to `Reveal` early, lock honest jurors out of
  committing AND revealing, and have them slashed as no-shows at `redraw`.
- Fix: `require!(commitment != [0u8; 32], ZeroCommitment)` before any state
  mutates; rejected calls leave counter + state untouched. Error variant
  appended at the enum tail (codes are sequential + stable), SDK error map
  entry added.
