---
# accord-hvf9
title: Home — hero + 'Cases awaiting you' inbox + case browser
status: completed
type: task
created_at: 2026-08-18T19:13:34Z
updated_at: 2026-08-18T19:13:34Z
parent: accord-5fe9
---

Canon HomePage shape. Inbox: getProgramAccounts scan of SynodCase where connected wallet ∈ parties[] AND joined bit clear, sorted by join_deadline, Join+Evidence CTA per card. Browser: all cases with state + roster fill. Hero carries the lockup tagline.

## Summary of Changes

- `features/home/HomePage.tsx` (canon HomePage shape): left-biased hero with the SYNOD lockup + "Convene the verdict." tagline + CTA to `/cases/new`; "Cases awaiting you" inbox (rendered only with a connected wallet); case browser grid (state, roster fill, stake, join deadline) with client-side pagination + loading/error/empty states. SynodLogo mark lands with accord-nwkd.
- `features/home/homeInbox.ts` — pure inbox logic TDD'd (8 tests): wallet ∈ `parties[0..party_count)` with joined bit clear on an `Opening` case (join is only actionable pre-file), sorted by join deadline ascending; `rosterFill` reuses `joinedCount` from caseDetail.
- `shared/fetch.ts` — `findAllSynodCases`: typed GPA scan over the Synod program (discriminator filter + `getSynodCaseDecoder`), canon `findAllCanonLists` shape.

Verify: app lint ✅ build ✅ tests 48/48 ✅; browser smoke on built bundle — hero + CTA render, inbox hidden without wallet, browser shows the devnet empty state, zero page errors; workspace CI trio exit 0.
