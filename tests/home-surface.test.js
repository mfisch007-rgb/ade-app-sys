import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// FINAL HOME-SURFACE FORENSIC CONTRACT — proves more than HTTP 200.
// Regression guard for the cbb4ebf blank-Home incident: one unbalanced paren
// in the single inline bundle killed every section. These tests fail the
// build if any public HTML ships unparseable boot JS, if the anonymous Home
// boot path requires auth, or if optional graph/data failure can blank Home.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const readPublic = (f) => fs.readFileSync(path.join(root, "public", f), "utf8");
const inlineScripts = (html) =>
  [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// 1. Every inline boot script in every public surface must parse.
for (const file of ["index.html", "founder.html", "admin/index.html"]) {
  test(`HOME-1 — ${file} inline boot JS parses (no bundle-killing syntax error)`, () => {
    const blocks = inlineScripts(readPublic(file));
    assert.ok(blocks.length > 0, `${file} has inline boot script`);
    blocks.forEach((code, n) => {
      const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ade-home-syntax-")), `block-${n}.js`);
      fs.writeFileSync(tmp, code);
      execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    });
  });
}

// 2. Mount contract: root element + single createRoot render, no competing init.
test("HOME-2 — Home document mounts exactly one application root", () => {
  const html = readPublic("index.html");
  assert.ok(html.includes('id="root"'), "root mount element exists");
  assert.equal((html.match(/createRoot\(/g) || []).length, 1, "exactly one createRoot (no competing initialization)");
  assert.ok(html.includes("ReactDOM.createRoot(document.getElementById('root')).render(h(App))"), "App renders into root");
});

// 3. Anonymous Home content is present in the served document path.
test("HOME-3 — anonymous Home pathways exist without login", () => {
  const html = readPublic("index.html");
  for (const marker of [
    "RUN YOUR BUSINESS THROUGH ADE",
    "procarta-intake-form",
    "community-intake-form",
    "invitation-hub",
    "I HAVE AN INVITATION",
    "accept-invitation-form"
  ]) assert.ok(html.includes(marker), `anonymous pathway present: ${marker}`);
});

// 4. Optional graph/explorer failure cannot blank Home: explorer is strictly
// opt-in (default closed, guarded empty state, never in the boot effect).
test("HOME-4 — OpsExplorer is opt-in and guarded; boot never requires it", () => {
  const html = readPublic("index.html");
  assert.ok(/useState\(false\),\[exploring/.test(html) || html.includes("[exploring,setExploring]=useState(false)"), "explorer defaults closed");
  assert.ok(html.includes("exploring?wsExplorePanel():wsPanel()"), "explorer is a branch, panels are the default");
  assert.ok(html.includes("if(!opsGraph)return"), "explorer degrades when the graph is unavailable");
  const bootEffect = html.slice(html.indexOf("useEffect(()=>{refresh()"), html.indexOf("useEffect(()=>{refresh()") + 600);
  assert.ok(!bootEffect.includes("loadOpsGraph"), "initial boot never waits on the ops graph");
});

// 5. Anonymous Home boot APIs are all publicly reachable (live execution).
test("HOME-5 — every Home boot API answers anonymously (no auth-gated first paint)", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-home-boot-"));
  process.chdir(tmpRoot);
  const { app } = await import("../src/app.js");
  const srv = app.listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    for (const p of [
      "/api/v1/health", "/api/v1/capabilities", "/api/v1/runtime", "/api/v1/edition",
      "/api/v1/demo/scenarios", "/api/v1/media/providers", "/api/v1/media/registry/stats",
      "/api/v1/procarta/status", "/api/v1/products", "/api/v1/metrics",
      "/api/v1/announcements", "/api/v1/connectivity/inventory", "/api/v1/product-surface",
      "/api/v1/notifications/recent?limit=5", "/api/v1/ops/graph"
    ]) {
      const r = await fetch(base + p);
      assert.equal(r.status, 200, `anonymous GET ${p} is 200 (got ${r.status})`);
    }
    const gated = await fetch(base + "/api/v1/icx/status");
    assert.equal(gated.status, 401, "ICX stays L2-gated while Home stays public");
  } finally {
    srv.close();
  }
});
