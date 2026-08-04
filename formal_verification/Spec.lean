import QEDGen.Solana.Spec

open QEDGen.Solana.SpecDSL

/-!
# Accord Verification Spec

Define the program's state, operations, invariants, and trust boundary here.
This file is the source of truth — proofs must satisfy the properties declared below.
-/

-- Uncomment and fill in your spec:
-- qedspec Accord where
--   state
--     owner : Pubkey
--     amount : U64
--
--   operation initialize
--     who: owner
--     when: Uninitialized
--     then: Active
--
--   operation transfer
--     who: owner
--     when: Active
--     then: Active
--     calls: TOKEN_PROGRAM_ID DISC_TRANSFER(source writable, destination writable, authority signer)
--
--   invariant conservation "total tokens preserved"
