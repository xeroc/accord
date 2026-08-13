/**
 * MarkdownDescription.test.ts — render-test the sanitized markdown renderer.
 *
 * Covers the accord-lfxx DoD: markdown displays, raw HTML is escaped (no XSS),
 * links open in a new tab with a safe rel, and unsafe protocols are stripped.
 * Uses `renderToStaticMarkup` so the test runs under node:test + tsx with no
 * DOM dependency.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownDescription } from "./MarkdownDescription";

function render(source: string): string {
  return renderToStaticMarkup(
    React.createElement(MarkdownDescription, { source }),
  );
}

test("MarkdownDescription: renders markdown formatting (h1/strong/code)", () => {
  const html = render("# Title\n\n**bold** and `code`");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test("MarkdownDescription: escapes raw HTML — no live <script>/<img onerror>", () => {
  const html = render(
    "<script>alert(1)</script><img src=x onerror=alert(1)>",
  );
  assert.ok(!/<script>/i.test(html), "no live <script> element");
  assert.ok(!/<img[^>]*onerror/i.test(html), "no live <img onerror>");
  // Raw HTML is escaped to inert text.
  assert.match(html, /&lt;script&gt;/);
});

test("MarkdownDescription: links open in a new tab with noopener/noreferrer", () => {
  const html = render("[Accord](https://accord.example)");
  assert.match(html, /<a\s+[^>]*target="_blank"/);
  assert.match(html, /<a\s+[^>]*rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/accord\.example"/);
});

test("MarkdownDescription: strips unsafe javascript: protocol", () => {
  const html = render("[x](javascript:alert(1))");
  assert.ok(!/javascript:/i.test(html), "no javascript: URL survives");
});
