import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// DEPLOYED-REALITY REPAIR — structural contracts (§8/9/14/17/20).
// These pin routing/execution semantics; HTTP behavior is covered by
// founder-session-lifecycle + elevation-persistence suites and live curl.

const indexHtml = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const founderHtml = fs.readFileSync(new URL("../public/founder.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const matrixJs = fs.readFileSync(new URL("../src/products/ProductSurfaceMatrix.js", import.meta.url), "utf8");

test("cta: every go() target is a real section (no dead/circular links)", () => {
  const namesBlock = indexHtml.slice(indexHtml.indexOf("const SECTION_NAMES=")).split("];")[0];
  const names = [...namesBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const targets = new Set([...indexHtml.matchAll(/go\('([^']+)'\)/g)].map((m) => m[1]));
  assert.ok(targets.size > 10, "meaningful CTA graph present");
  for (const t of targets) {
    assert.ok(names.includes(t), "dead go() target: " + t);
  }
});

test("execute: results render, input-gated intents route, denials explain", () => {
  assert.ok(indexHtml.includes("summarizeCmd"), "result summarizer present");
  assert.ok(indexHtml.includes("setCmdResult"), "result state rendered");
  assert.ok(indexHtml.includes("LAST RESULT — "), "result card in palette");
  assert.ok(indexHtml.includes("AI Gateway needs a prompt"), "AI gateway routes instead of naked-failing");
  assert.ok(indexHtml.includes("paletteQuery"), "palette query doubles as AI prompt");
  assert.ok(indexHtml.includes("Watch Asset needs an instrument"), "watch-asset routes to Connect");
  assert.ok(indexHtml.includes("PRO / Level-2 capability"), "edition gate names path forward");
  assert.ok(indexHtml.includes("AUTHORIZATION REQUIRED. Opening Account"), "RBAC denial names levels + path");
  assert.ok(indexHtml.includes("PONG — kernel"), "PING renders measured result");
});

test("decisions: grouped by authority with purpose and next step", () => {
  assert.ok(indexHtml.includes("RUNNABLE NOW"), "runnable group labeled");
  assert.ok(indexHtml.includes("REQUIRES HIGHER AUTHORITY"), "gated group labeled");
  assert.ok(indexHtml.includes("Elevation path"), "gated items carry next step");
  assert.ok(!indexHtml.includes("full list lives in Operations below"), "misleading footer removed");
});

test("shell: elevation wording and Home/Back are explicit", () => {
  assert.ok(indexHtml.includes("BASE — ELEVATION REQUIRED"), "founder/admin base states its requirement");
  assert.ok(indexHtml.includes("← Back"), "real-history Back present");
  assert.ok(indexHtml.includes("ADE · Workspace ·"), "breadcrumb present");
  assert.ok(founderHtml.includes("window.location.href='/'"), "founder brand returns home");
});

test("matrix: awbuli/procarta/eventos carry actionable destinations", () => {
  for (const id of ["awbuli", "procarta", "eventos"]) {
    const i = matrixJs.indexOf("id: \"" + id + "\"") >= 0 ? matrixJs.indexOf("id: \"" + id + "\"") : matrixJs.indexOf("id: '" + id + "'");
    assert.ok(i >= 0, id + " declared in matrix");
    const block = matrixJs.slice(i, i + 1200);
    assert.ok(/go:[A-Za-z ]+|href:/.test(block), id + " has a non-generic destination");
  }
});

test("asset: tech-hub visual forensics pin the crop defect and fix", () => {
  const buf = fs.readFileSync(new URL("../public/brand-mark.png", import.meta.url));
  assert.equal(buf.slice(0, 8).toString("hex"), "89504e470d0a1a0a", "valid PNG bytes");
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  assert.ok(h > w * 2, "portrait asset (" + w + "x" + h + ") — cover-crop at landscape box was destructive");
  assert.ok(indexHtml.includes("objectFit:'contain'"), "contain fix present");
  assert.ok(indexHtml.includes("hubVisual"), "responsive hook present");
});
