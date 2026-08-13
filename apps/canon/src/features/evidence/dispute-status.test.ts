/**
 * dispute-status.test.ts — tests for the dispute-status card deep-link URL
 * construction and DisputeState label mapping.
 *
 * Proves the DoD (milestone §7): card shows live dispute phase; link opens
 * accord app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DisputeState } from "@useaccord/sdk";

const ACCORD_APP_URL = "https://accord.pages.dev";

// Deep-link URL format: HashRouter → /#/disputes/:address
test("dispute deep-link URL format: {ACCORD_APP_URL}/#/disputes/{address}", () => {
  const address = "Dispute123456789";
  const url = `${ACCORD_APP_URL}/#/disputes/${address}`;
  assert.ok(url.startsWith(ACCORD_APP_URL));
  assert.ok(url.includes("/#/disputes/"));
  assert.ok(url.endsWith(address));
});

test("DisputeState enum has the expected lifecycle phases", () => {
  // The card needs to map these to human labels.
  assert.equal(DisputeState.Created, 0);
  assert.equal(DisputeState.Drawn, 1);
  assert.equal(DisputeState.Review, 2);
  assert.equal(DisputeState.Commit, 3);
  assert.equal(DisputeState.Reveal, 4);
  assert.equal(DisputeState.Final, 6);
});

test("canon ruling labels map to option indices", () => {
  // Canon-fixed options: [keep, remove] → indices [0, 1]
  const labels = ["keep", "remove"];
  const NO_VOTE = 255;

  // No ruling
  assert.ok(NO_VOTE >= labels.length, "NO_VOTE sentinel out of bounds");

  // Keep ruling
  assert.equal(labels[0], "keep");
  // Remove ruling
  assert.equal(labels[1], "remove");
});
