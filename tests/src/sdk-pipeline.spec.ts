// sdk-pipeline.spec.ts — the jest ↔ @solana/kit ↔ @accord/sdk pipeline smoke.
//
// Foundational check (ADR-0010) that the harness imports the SDK, the Kit
// client resolves under ESM jest, and the Accord facade exposes a wired
// adapter + bound methods namespace. Does NOT touch a validator.
//
// ADR-0012: the snapshot trio (post/challenge/finalize) and the one-shot
// `draw` are gone; `stake`/`unstake` thread an accumulator `path`; `drawSeat`
// fills the panel one seat per tx; `awaitCommittedVrf` polls the frozen root.
import {
  Accord,
  ACCORD_PROGRAM_ID,
  createAccordAdapter,
  createAccordMethods,
  type AccordAdapter,
  type AccordMethods,
} from "@accord/sdk";
import type { Address, TransactionSigner } from "@solana/kit";

/** Minimal offline TransactionSigner — no signing happens in this smoke. */
function stubSigner(): TransactionSigner {
  const address = "11111111111111111111111111111111" as Address;
  return {
    address,
    signTransactions: async () => [],
  } as unknown as TransactionSigner;
}

describe("jest ↔ kit ↔ sdk pipeline", () => {
  it("imports the SDK and exposes the canonical program id", () => {
    // The keypair (target/deploy/accord-keypair.json) is the deploy truth;
    // declare_id!, Anchor.toml, and ACCORD_PROGRAM_ID are all synced to it.
    expect(ACCORD_PROGRAM_ID).toBe(
      "9hwXxiJKWkGkr7wLhTXmxJazxDExRtTgeZVAaXPZS74b",
    );
  });

  it("constructs an Accord facade offline (no RPC round-trip)", () => {
    const accord = new Accord({
      endpoint: "http://127.0.0.1:8899",
      signer: stubSigner(),
    });
    expect(Accord.PROGRAM_ID).toBe(ACCORD_PROGRAM_ID);
    expect(accord.signer.address).toBe("11111111111111111111111111111111");
    // The generated Codama client is wired (accounts + instructions + pdas).
    expect(accord.client.accord.accounts.dispute).toBeDefined();
    expect(accord.client.accord.instructions.createDispute).toBeDefined();
  });

  it("exposes a wired adapter implementing every seam", () => {
    const accord = new Accord({
      endpoint: "http://127.0.0.1:8899",
      signer: stubSigner(),
    });
    const adapter: AccordAdapter = accord.adapter;
    // One builder per instruction group + the fetchers — presence proves the
    // concrete wiring landed (snapshot trio + one-shot draw removed in ADR-0012).
    for (const name of [
      "buildCreateDispute",
      "fetchDispute",
      "buildCreateSubaccord",
      "buildStake",
      "buildUnstake",
      "fetchJurorStake",
      "buildRequestVrf",
      "buildDrawSeat",
      "fetchCommittedVrf",
      "buildCommit",
      "buildReveal",
      "buildFinalizeRound",
      "buildFinalizeDispute",
      "buildAppeal",
      "buildClaimAppealRefund",
      "encodeAddress",
    ] as const) {
      expect(typeof (adapter as unknown as Record<string, unknown>)[name]).toBe(
        "function",
      );
    }
  });

  it("encodeAddress returns the 32-byte pubkey encoding", () => {
    const accord = new Accord({
      endpoint: "http://127.0.0.1:8899",
      signer: stubSigner(),
    });
    const bytes = accord.adapter.encodeAddress(ACCORD_PROGRAM_ID);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
  });

  it("exposes the bound methods namespace (post-ADR-0012 surface)", () => {
    const accord = new Accord({
      endpoint: "http://127.0.0.1:8899",
      signer: stubSigner(),
    });
    const methods: AccordMethods = accord.methods;
    for (const name of [
      "createDispute",
      "getRuling",
      "createSubaccord",
      "stake",
      "unstake",
      "requestVrf",
      "awaitCommittedVrf",
      "drawSeat",
      "commit",
      "reveal",
      "finalizeRound",
      "finalizeDispute",
      "appeal",
      "claimAppealRefund",
    ] as const) {
      expect(typeof (methods as unknown as Record<string, unknown>)[name]).toBe(
        "function",
      );
    }
  });

  it("createAccordAdapter / createAccordMethods are independently callable", () => {
    const accord = new Accord({
      endpoint: "http://127.0.0.1:8899",
      signer: stubSigner(),
    });
    expect(() => createAccordAdapter(accord)).not.toThrow();
    expect(() =>
      createAccordMethods(accord.adapter, ACCORD_PROGRAM_ID),
    ).not.toThrow();
  });
});
