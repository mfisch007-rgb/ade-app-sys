import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// PRODUCT NARRATIVE GUARDS — every canonical surface carries a truthful,
// business-first summary from ONE server-side source (ProductSurfaceMatrix),
// the homepage explains ADE without manual founder intervention, O-L-D-E-I is
// presented as one operating philosophy, the product modal renders canonical
// server data, and CI matches the Node 24 engines lock.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const BANNED = /fully autonomous|guaranteed savings|guaranteed|enterprise-ready|production-ready/i;

test("MATRIX-SUMMARY-1 — every canonical surface carries a server-side business summary", async () => {
  const { ProductSurfaceMatrix } = await import(
    pathToFileURL(path.join(ROOT, "src/products/ProductSurfaceMatrix.js")).href
  );
  const rows = new ProductSurfaceMatrix().build();
  assert.equal(rows.length, 24, "24 canonical surfaces are declared");
  for (const r of rows) {
    assert.ok(typeof r.summary === "string" && r.summary.length >= 40, `surface ${r.id} has a real summary`);
    assert.ok(!BANNED.test(r.summary), `surface ${r.id} summary avoids unsupported claims`);
  }
});

test("MATRIX-HONESTY-1 — availability-sensitive products state their real prerequisites", async () => {
  const { ProductSurfaceMatrix } = await import(
    pathToFileURL(path.join(ROOT, "src/products/ProductSurfaceMatrix.js")).href
  );
  const byId = new Map(new ProductSurfaceMatrix().build().map((r) => [r.id, r]));
  assert.ok(byId.get("awbuli").summary.includes("requires server-side provider setup"), "AWBULI states provider requirement");
  assert.ok(byId.get("awbuli").summary.includes("verified sender identity"), "AWBULI states sender-identity requirement");
  assert.ok((byId.get("tides").summary + byId.get("biz-watch").summary + byId.get("gov-ngo").summary).match(/roadmap|in development|future/i), "roadmap surfaces are labelled");
  assert.ok(byId.get("aibos").summary.includes("shared"), "AIBOS is presented as the shared platform layer");
  assert.ok(byId.get("founders-circle").summary.includes("pilot") || byId.get("founders-circle").summary.includes("Pilot"), "FOUNDERS CIRCLE points to a real entry pathway");
  assert.equal(byId.get("awbuli").frontendRoute, "#/products", "AWBULI status lives on the product surface");
  assert.ok(!String(byId.get("awbuli").iconButton.action).includes("Theater"), "AWBULI status action never routes to Theater");
});

test("HOME-NARRATIVE-2 — ADE is explained on the homepage without manual intervention", () => {
  const html = read("public/index.html");
  for (const marker of [
    "ADE stands for Automated Alpha Aliph Digital Ecosystems",
    "interconnected, AI-powered business operating ecosystem",
    "organizations beyond Africa",
    "reduce operational waste",
    "better-informed decisions"
  ]) {
    assert.ok(html.includes(marker), `hero explains: ${marker}`);
  }
  assert.ok(/AUTOMATED ALPHA ALIPH DIGITAL ECOSYSTEMS/.test(html), "acronym expansion is visible");
  assert.ok(html.includes("RUN YOUR BUSINESS THROUGH ADE"), "the pinned H1 is preserved");
});

test("PHILOSOPHY-1 — O-L-D-E-I is one operating philosophy, not five products", () => {
  const html = read("public/index.html");
  assert.ok(html.includes("Observe, Learn, Decide, Execute, Improve (O-L-D-E-I)"), "full written sequence leads, acronym secondary");
  assert.ok(html.includes("not five separate products"), "explicitly framed as one philosophy");
  assert.ok(html.includes("is illustrative"), "the running example is labelled illustrative");
  assert.ok(html.includes("no product is assigned to a single stage"), "no invented one-product-per-stage mapping");
  for (const step of ["'01 · Observe'", "'02 · Learn'", "'03 · Decide'", "'04 · Execute'", "'05 · Continuously Improve'"]) {
    assert.ok(html.includes(step), `stage present: ${step}`);
  }
});

test("SHARED-CAPABILITIES-1 — kernel services are explained as shared capabilities, not products", () => {
  const html = read("public/index.html");
  assert.ok(html.includes("'data-testid':'shared-capabilities'"), "shared capabilities section exists");
  assert.ok(html.includes("not standalone products"), "framing is explicit");
  for (const engine of ["Decision Engine", "Workflow Engine", "Knowledge Service", "Rules & Confidence", "Guardian Policy", "Capability Registry", "Connection Fabric", "Audit Ledger", "Universal AI Gateway", "Event Bus", "Identity & PIN Elevation", "Durable Storage"]) {
    assert.ok(html.includes(engine), `capability explained: ${engine}`);
  }
});

test("MODAL-CANONICAL-1 — the product detail modal renders canonical server truth", () => {
  const html = read("public/index.html");
  assert.ok(html.includes("'data-canonical':'product-detail-canonical'"), "canonical detail block exists");
  assert.ok(html.includes("'data-testid':'product-canonical-summary'"), "canonical summary is rendered");
  assert.ok(html.includes("su.summary"), "modal consumes the server summary");
  assert.ok(html.includes("'data-testid':'product-canonical-next'"), "canonical next action exists");
  assert.ok(html.includes("surfaceGo(su)"), "next action routes through the canonical surface action resolver");
  assert.ok(html.includes("pubB(su.status)"), "availability renders from the server status enum");
  assert.ok(html.includes("'WHAT IS NEEDED: '"), "prerequisites are stated from server data");
  assert.ok(/WHAT IS NEEDED: nothing — live on this runtime\./.test(html), "no-requirement state is honest");
});

test("FOUNDER-SUMMARY-1 — founder product visibility reuses the same canonical summaries", () => {
  const founder = read("public/founder.html");
  assert.ok(founder.includes("PRODUCT VISIBILITY"), "founder card present");
  assert.ok(founder.includes("su.summary"), "founder card renders the canonical server summary");
  assert.ok(founder.includes("/api/v1/product-surface"), "founder card consumes the server product surface");
});

test("NO-BANNED-CLAIMS-2 — public narrative avoids unsupported claims", () => {
  for (const f of ["public/index.html", "public/founder.html"]) {
    const html = read(f);
    assert.ok(!BANNED.test(html), `${f} contains no unsupported-claim phrasing`);
  }
});

test("CI-NODE-24-1 — GitHub Actions workflows match the Node 24 engines lock", () => {
  for (const f of [".github/workflows/ci-cd.yml", ".github/workflows/production-verification.yml"]) {
    const y = read(f);
    assert.ok(/node-version:\s*24/.test(y), `${f} pins node-version 24`);
    assert.ok(!/node-version:\s*22/.test(y), `${f} no longer pins node 22`);
  }
});
