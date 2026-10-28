---
"@useaccord/tests": patch
---

e2e harness: slot warps migrated off the Clock-sysvar `surfnet_setAccount` workaround to `surfnet_timeTravel { absoluteSlot }` (`warpForwardSlots`/new `warpToSlot`) — surfpool 1.7.0 rejects sysvar writes as managed (surfpool#895) and lands absolute slots exactly (pre-1.7 wrapped mod slotsInEpoch). Suite now REQUIRES surfpool >= 1.7.0. `cheat()` surfaces `error.data` so rejections aren't opaque "Internal error"s.
