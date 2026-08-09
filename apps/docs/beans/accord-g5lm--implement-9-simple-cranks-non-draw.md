---
# accord-g5lm
title: Implement 9 simple cranks (non-draw)
status: todo
type: task
created_at: 2026-08-09T20:15:13Z
updated_at: 2026-08-09T20:15:13Z
parent: accord-t5rx
---

One file per crank in src/cranks/:

- request-vrf.ts: Created without committedVrf → requestVrf()
- finalize-round.ts: past revealEnd → finalizeRound()
- finalize-dispute.ts: past appealWindow → finalizeDispute()
- settle-round.ts: Final, prior round unsettled → settleRound()
- cancel-dispute.ts: past timeout → cancelDispute()
- redraw.ts: RedrawEligible → redraw()
- execute-update.ts: slot >= executeAfterSlot → executeSubaccordUpdate()
- execute-unpause.ts: slot >= pendingUnpauseAfter → executeUnpause()
- claim-refund.ts: Final/Failed, bond outstanding → claimAppealRefund()

Each: read dispute state via SDK decoder, build instruction via SDK builder,
send via sendIx with retry. Register in dispatch map (src/dispatch.ts).
All use @useaccord/sdk — no raw instruction encoding.
