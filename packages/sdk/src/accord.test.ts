// accord.test.ts — runnable self-check for the facade's plugin-client wiring.
// The kit 7 program-client contract (AccordPluginRequirements = ClientWithRpc &
// …) requires the object passed to accordProgram() to carry the RPC on a `.rpc`
// property: generated fetchers call fetchEncodedAccount(client.rpc, …). Passing
// the raw RPC proxy instead left client.rpc as a fabricated JSON-RPC
// method-builder, and every facade fetch died with "rpc.getAccountInfo is not a
// function". This is the smallest check that fails if the wiring regresses.
// Excluded from the build; run via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSigner } from "@solana/kit";

import { Accord } from "./accord.js";

test("facade wires the plugin client over ClientWithRpc (client.rpc === facade.rpc)", async () => {
  const signer = await generateKeyPairSigner();
  const accord = new Accord({ endpoint: "http://127.0.0.1:8899", signer });

  assert.equal(
    accord.client.rpc,
    accord.rpc,
    "accordProgram() must receive { rpc } (ClientWithRpc), not the raw RPC proxy",
  );
});
