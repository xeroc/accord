/**
 * content.test.ts — checks the blurb copy contract: the email composes
 * from its parts, every explainer is fully wired (permalink + local
 * media), the brand hexes are the canonical tokens, and the integrity law
 * holds (the HANSE/riprap-only post stays out of the Accord explainers).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BRAND_ASSETS,
  BRAND_COLORS,
  EMAIL_BODY,
  EMAIL_FULL,
  EMAIL_SUBJECT,
  EXPLAINERS,
  ONE_LINE,
  SHORT_BLURB,
  STANDARD_BLURB,
  STATUS,
} from "./content";

test("email: the clipboard string composes subject + body", () => {
  assert.equal(EMAIL_FULL, `Subject: ${EMAIL_SUBJECT}\n\n${EMAIL_BODY}`);
  assert.ok(EMAIL_BODY.includes("https://useaccord.xyz/#/blurb"));
});
test("words: every copyable block names the domain and stays honest about status", () => {
  for (const block of [ONE_LINE, SHORT_BLURB, STANDARD_BLURB]) {
    assert.ok(block.includes("useaccord.xyz"), "carries the domain");
  }
  assert.match(STATUS, /build target/);
});

test("explainers: every entry has a permalink, a local poster frame, and a kicker", () => {
  assert.ok(EXPLAINERS.length >= 5);
  for (const tweet of EXPLAINERS) {
    assert.match(tweet.url, /^https:\/\/x\.com\/xer0c\/status\/\d+$/);
    assert.match(tweet.media, /^\/blurb\/.+\.jpg$/);
    assert.match(tweet.kicker, /^\d\d · /);
    if (tweet.video) assert.match(tweet.video, /^\/blurb\/.+\.mp4$/);
    if (tweet.youtubeEmbed) assert.ok(tweet.youtubeUrl, "embed implies a visible link too");
  }
});

test("explainers: the riprap-only HANSE post is not presented as Accord's", () => {
  assert.ok(!EXPLAINERS.some((t) => t.media.includes("hanse")));
});

test("brand: assets served as svg, colors carry canonical token hexes", () => {
  for (const asset of BRAND_ASSETS) assert.match(asset.svg, /\.svg$/);
  const hexes = BRAND_COLORS.flatMap((g) => g.colors.map((c) => c.hex.toLowerCase()));
  for (const canonical of ["#0a0e14", "#11161d", "#1f2630", "#f0a830", "#3fb950", "#f85149"]) {
    assert.ok(hexes.includes(canonical), `${canonical} is in the palette`);
  }
});
