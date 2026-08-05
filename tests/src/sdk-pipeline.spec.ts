// sdk-pipeline.spec.ts — the jest ↔ @solana/kit ↔ @veridao/sdk pipeline smoke.
//
// This is the foundational check (ADR-0010) that the integration harness can
// import the SDK, the SDK's Kit-shaped client resolves under ESM jest, and the
// Accord facade exposes a wired adapter + bound methods namespace. It does NOT
// touch a validator — the on-chain pipeline (program deploy, health, lifecycle)
// is exercised by the sibling lifecycle specs, which are pending the canonical
// deploy keypair (veridao-mcvw follow-up) + the Surfpool VRF-oracle decision.
import {
  Accord,
  ACCORD_PROGRAM_ID,
  createAccordAdapter,
  createAccordMethods,
  type AccordAdapter,
  type AccordMethods,
} from "@veridao/sdk";
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
    expect(ACCORD_PROGRAM_ID).toBe(
      "RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe",
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
    // One method per seam group — presence proves the concrete wiring landed.
    expect(typeof adapter.buildCreateDispute).toBe("function");
    expect(typeof adapter.fetchDispute).toBe("function");
    expect(typeof adapter.buildCreateSubaccord).toBe("function");
    expect(typeof adapter.buildStake).toBe("function");
    expect(typeof adapter.buildPostSnapshot).toBe("function");
    expect(typeof adapter.buildRequestVrf).toBe("function");
    expect(typeof adapter.buildDraw).toBe("function");
    expect(typeof adapter.buildCommit).toBe("function");
    expect(typeof adapter.buildAppeal).toBe("function");
    expect(typeof adapter.encodeAddress).toBe("function");
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

  it("exposes the bound methods namespace covering all eight groups", () => {
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
      "postSnapshot",
      "challengeSnapshot",
      "finalizeSnapshot",
      "requestVrf",
      "draw",
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
