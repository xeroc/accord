---
# accord-1n05
title: 'Canon challenge: publish evidence after dispute creation (daemon 404)'
status: completed
type: bug
created_at: 2026-08-18T22:57:45Z
updated_at: 2026-08-18T22:57:45Z
---

ChallengePage published evidence BEFORE sending challengeItem; daemon ingest reads the dispute on-chain and 404s (ingest.ts:135). Split into buildChallengeEvidence (offline) + publishChallengeEvidence (fetch-only); page order now build -> tx -> publish with publish-only retry holding the same manifest (mirrors Accord CreateDispute spine). Also quoted the app test glob so depth-3 tests actually run (56, not 30).
