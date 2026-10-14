import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * PRODUCT DISCOVERY & VISIBILITY — static regression pin.
 *
 * The public homepage, Founder console and Admin console are server-served
 * HTML with inline scripts (no bundler). These tests pin the
 * implementation-visible contract delivered by the product-experience
 * transformation without a browser:
 *   - every registered suite is discoverable on the homepage,
 *   - HOME cards/modal read the SAME canonical product-surface rows
 *     (live status, never invented),
 *   - AWBULI pipeline + guided entry points exist,
 *   - pilot approve/verdict + channel baseUrl wiring exist,
 *   - all three inline scripts still parse (a single paren defect kills
 *     the entire React surface — this happened in founder.html).
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const SUITES = ["NEXUS™", "PROCARTA™", "AWBULI™", "EVENTOS™"];

test("DISCOVERY-1 — all four canonical suites are discoverable on the homepage", () => {
  const html = read("public/index.html");
  for (const suite of SUITES) {
    assert.ok(html.includes(suite), `homepage must surface ${suite}`);
  }
});

test("DISCOVERY-2 — HOME cards link to live surface rows (surfId), modal renders live status", () => {
  const html = read("public/index.html");
  for (const id of ["nexus", "procarta", "awbuli", "eventos"]) {
    assert.ok(html.includes(`surfId:'${id}'`), `card modal payload must carry surfId '${id}'`);
  }
  assert.ok(html.includes("surfById"), "surfById lookup must exist");
  assert.ok(html.includes("suite-live-status"), "live status strip must exist");
  assert.ok(html.includes("product-live-status"), "modal live status block must exist");
  assert.ok(html.includes("surfLiveStrip(['procarta','awbuli','nexus','eventos'])"), "strip must cover the four canonical suites");
});

test("DISCOVERY-3 — AWBULI pipeline + guided entry points exist", () => {
  const html = read("public/index.html");
  assert.ok(html.includes("awbuli-pipeline"), "AWBULI channel pipeline section must exist");
  assert.ok(html.includes("who-ade-serves"), "audience section must exist");
  assert.ok(html.includes("How to begin"), "guided begin strip must exist");
  assert.ok(html.includes("PILOT_INTEREST"), "pilot pathway must be wired");
  assert.ok(html.includes("PARTNER_INTEREST"), "partner pathway must be wired");
});

test("DISCOVERY-4 — workspace pilot approvals call the canonical APIs with reasons", () => {
  const html = read("public/index.html");
  assert.ok(html.includes("/api/v1/procarta/pilot/approve"), "approve endpoint must be wired");
  assert.ok(html.includes("/api/v1/procarta/pilot/verdict"), "verdict endpoint must be wired");
  assert.ok(html.includes("Decision reason"), "mandatory reason input must exist");
});

test("DISCOVERY-5 — admin channel configure forwards the provider endpoint as baseUrl", () => {
  const html = read("public/admin/index.html");
  assert.ok(html.includes("cfgEndpoint"), "endpoint input must exist");
  assert.ok(html.includes("baseUrl"), "handler must forward baseUrl");
  assert.ok(html.includes("Saved —"), "saved confirmation must exist");
});

test("DISCOVERY-6 — founder overview renders server-reported product visibility", () => {
  const html = read("public/founder.html");
  assert.ok(html.includes("/api/v1/product-surface"), "founder must fetch product-surface");
  assert.ok(html.includes("PRODUCT VISIBILITY"), "founder overview must show product visibility");
  assert.ok(html.includes("setProductSurface"), "founder must store product-surface state");
});

test("DISCOVERY-7 — inline scripts of all three consoles parse (no dead-surface regressions)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-visibility-"));
  for (const file of ["public/index.html", "public/founder.html", "public/admin/index.html"]) {
    const html = read(file);
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(blocks.length > 0, `${file} must contain an inline script`);
    const biggest = blocks.reduce((a, b) => (a.length > b.length ? a : b));
    const tmp = path.join(dir, `${path.basename(path.dirname(file)) || "root"}-check.js`);
    fs.writeFileSync(tmp, biggest);
    try {
      execSync(`node --check ${JSON.stringify(tmp)}`, { stdio: "pipe" });
    } catch {
      assert.fail(`${file} inline script does not parse — the whole console would be dead`);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
