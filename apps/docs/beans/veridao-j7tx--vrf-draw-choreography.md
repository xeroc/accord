---
# veridao-j7tx
title: VRF & draw choreography
status: todo
type: task
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-04T21:51:58Z
parent: veridao-gqzm
---

src/methods/vrf.ts: the hardest orchestration. request_vrf -> await/poll commit_vrf_callback -> draw(draw_attempt, memberships). On SortitionMismatch/collision, increment draw_attempt and retry using the SAME committed VRF (never re-request). Compose with snapshot.ts memberships builder. Acceptance: full request->commit->draw flow runs; retry-on-collision unit-tested. See ADR-0010 §Business Logic + ADR-0009.
