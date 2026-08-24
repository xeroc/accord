/**
 * waitlist.test.ts — checks the submitWaitlist seam: the four status
 * strings, the n8n POST contract, and the form-reset flag.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { submitWaitlist } from "./waitlist";

test("submitWaitlist: empty endpoint degrades to the Telegram message", async () => {
  const res = await submitWaitlist("", "you@protocol.xyz", fetch);
  assert.equal(res.ok, false);
  assert.equal(res.message, "Waitlist not wired yet — ping us on Telegram.");
  assert.equal(res.reset, false);
});

test("submitWaitlist: non-2xx response reports failure", async () => {
  const fetchImpl = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  const res = await submitWaitlist("https://n8n.example.com/webhook", "you@protocol.xyz", fetchImpl);
  assert.equal(res.ok, false);
  assert.equal(res.message, "Couldn't reach the list — try Telegram.");
  assert.equal(res.reset, false);
});

test("submitWaitlist: network error reports failure", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  const res = await submitWaitlist("https://n8n.example.com/webhook", "you@protocol.xyz", fetchImpl);
  assert.equal(res.ok, false);
  assert.equal(res.message, "Couldn't reach the list — try Telegram.");
  assert.equal(res.reset, false);
});

test("submitWaitlist: ok response reports success, requests reset, posts the n8n contract", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(input);
    seenInit = init;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const res = await submitWaitlist(
    "https://n8n.example.com/webhook",
    "you@protocol.xyz",
    fetchImpl,
  );
  assert.equal(res.ok, true);
  assert.equal(res.message, "On the list. One email when v1 ships on mainnet.");
  assert.equal(res.reset, true);
  assert.equal(seenUrl, "https://n8n.example.com/webhook");
  assert.equal(seenInit?.method, "POST");
  assert.equal(seenInit?.headers && (seenInit.headers as Record<string, string>)["Content-Type"], "application/json");
  const body = JSON.parse(String(seenInit?.body));
  assert.equal(body.email, "you@protocol.xyz");
  assert.equal(body.type, "waitlist");
  assert.equal(typeof body.timestamp, "string");
});
