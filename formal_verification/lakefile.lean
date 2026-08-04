import Lake
open Lake DSL

package accordProofs

require qedgenSupport from
  "./lean_solana"

@[default_target]
lean_lib AccordSpec where
  roots := #[`Spec, `Proofs]
