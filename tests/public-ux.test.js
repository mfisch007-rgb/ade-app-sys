import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("ux: ADE identity statement is visible and marked", () => {
  assert.ok(html.includes("This is not Another AI, But The Future!"));
  assert.ok(html.includes('data-testid') && html.includes("ade-identity-statement"));
});

test("ux: community intake is self-describing in plain language", () => {
  for (const phrase of [
    "What is your business",
    "exact pain point",
    "struggling with",
    "best words you understand",
    "trying to improve",
    "which part of your business",
    "Which part of your business needs help?"
  ]) {
    assert.ok(html.toLowerCase().includes(phrase.toLowerCase()), `missing: ${phrase}`);
  }
  for (const marker of [
    "community-intake-form", "intake-organization", "intake-pain-point",
    "try-procarta", "request-pilot", "partner-with-ade", "try-community",
    "procarta-intake-form", "procarta-pain-point"
  ]) {
    assert.ok(html.includes(marker), `missing marker: ${marker}`);
  }
});

test("ux: hash navigation behaves like normal web software", () => {
  assert.ok(html.includes("pushState"), "pushState for section navigation");
  assert.ok(html.includes("replaceState"), "replaceState for initial load");
  assert.ok(html.includes("popstate"), "popstate restores section on Back");
  assert.ok(html.includes("sectionFromHash"), "hash-derived section");
  // Modals must not push history: palette/auth setters appear without pushState nearby.
  const goIdx = html.indexOf("const go=");
  const palettePushes = (html.match(/setPalette\(true\)[^;]*pushState/g) || []).length;
  assert.equal(palettePushes, 0);
  assert.ok(goIdx > 0);
});

test("ux: connectivity grip meter is rendered with truthful states", () => {
  assert.ok(html.includes("Degree of Connection Grip"));
  assert.ok(html.includes("connectivity-grip"));
  for (const marker of ["CONNECTED:", "PARTIAL:", "UNAVAILABLE:", "ACTION REQUIRED:"]) {
    assert.ok(html.includes(marker), `missing: ${marker}`);
  }
});

test("ux: responsive foundations intact (no clipping regressions)", () => {
  assert.ok(html.includes("@media"), "responsive breakpoints present");
  assert.ok(html.includes("overflow-x:clip") || html.includes("overflow-x:hidden"), "horizontal clipping guard");
  assert.ok(html.includes("max-width:100%"), "fluid max-width guard");
  assert.ok(html.includes("min-height:44px") || html.includes("min-height:48px"), "touch targets preserved");
});
