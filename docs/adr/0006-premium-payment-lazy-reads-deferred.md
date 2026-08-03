# DEFERRED: Premium payment system integration via lazy reads

> **Status: DEFERRED.** The specific premium payment rail is deferred to a later phase. See BEAN-5 in context/grilling-beans.md.

The Mutual program never caches coverage/payment status. It reads the payment system's state live, on-the-fly, at every interaction (Claim filing, coverage check). The payment record is the single source of truth.

## Core principle (rail-agnostic)

Regardless of which payment rail is ultimately chosen, the lazy-read pattern holds: no cached coverage state, no cranker for payment status, the payment system's record IS the coverage status.

## What changes when the rail is selected

- The specific account/PDA to read (and its deserialization struct)
- The fields that indicate payment status (active/current/lapsed)
- The field that provides payment count (for tenure-based coverage)
- The address-derivation logic for verifying the correct payment account

The lazy-read pattern itself does not change.
