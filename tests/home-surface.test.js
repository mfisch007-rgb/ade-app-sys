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

test("HOME-3b — AWBULI status action opens the AWBULI surface, not Theater", () => {
  const html = readPublic("index.html");
  assert.ok(html.includes("'data-testid':'awbuli-status-link',onClick:()=>openAwbuli()"), "status button opens AWBULI");
  assert.ok(!html.includes("onClick:()=>go('Product Theater')},'See AWBULI Status'"), "status button never routes to Theater");
  const start = html.indexOf("const openAwbuli=");
  const body = html.slice(start, html.indexOf("});", start) + 2);
  assert.ok(start >= 0 && body.length > 20, "openAwbuli handler exists");
  assert.ok(!body.includes("Product Theater"), "AWBULI status modal never embeds a Theater destination");
});

test("HOME-3d — public sign-in completes in one submit and step-up stays separate", () => {
  const html = readPublic("index.html");
  const start = html.indexOf("const signIn=async()=>{");
  assert.ok(start >= 0, "signIn handler exists");
  const body = html.slice(start, html.indexOf("const pinLogin=async()=>{", start));
  assert.ok(body.includes("api('/api/v1/account/login'"), "single login request");
  assert.ok(body.includes("setToken(r.token)"), "login stores the issued session");
  assert.ok(body.includes("setAuth(false)"), "login closes the modal in the same submit");
  assert.ok(body.includes("go('Workspace')"), "login navigates to the workspace in the same submit");
  assert.ok(!body.includes("setAuth(true)"), "successful login does not reopen the modal");
  assert.ok(html.includes("onKeyDown:e=>{if(e.key==='Enter')signIn()}"), "username field submits on Enter");
  assert.ok(html.includes("api('/api/v1/account/pin'"), "PIN step-up remains a distinct server call");
});

test("HOME-3e - retained-case attach uses the freshly issued token, not stale render state", () => {
  const html = readPublic("index.html");
  assert.ok(html.includes("const tokenRef=React.useRef(token);"), "current token ref exists");
  assert.ok(html.includes("const setToken=(v)=>{tokenRef.current=v;_setToken(v);"), "setToken updates the ref synchronously");
  assert.ok(
    html.includes('const authToken=tokenRef.current;if(authToken)headers.Authorization="Bearer "+authToken;'),
    "api authorizes with the current token ref"
  );
  const start = html.indexOf("const openRetainedCase=async(id)=>{");
  assert.ok(start >= 0, "openRetainedCase exists");
  const body = html.slice(start, html.indexOf("const submitProcarta=", start));
  assert.ok(body.includes("if(!tokenRef.current)"), "retained-case guard reads the current token");
  assert.ok(!body.includes("if(!token)"), "retained-case guard must not read the stale render token");
});

test("HOME-3c — public surfaces expose no raw source media or manifest", () => {
  const home = readPublic("index.html");
  const experience = readPublic("ade-experience/index.html");
  for (const marker of ["Try_again(3).mp4", "Continue(2).mp4", "SOURCE MEDIA LIBRARY", "media-manifest.json", "/ade-experience/media/"]) {
    assert.ok(!home.includes(marker), `Home does not expose private media marker: ${marker}`);
  }
  for (const marker of ["Try_again(3).mp4", "sourceVideo", "Source media"]) {
    assert.ok(!experience.includes(marker), `Experience layer does not expose private media marker: ${marker}`);
  }
  const backups = fs.readdirSync(path.join(root, "public"), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".bak"));
  assert.deepEqual(backups, [], `Public tree ships no backup files: ${backups.join(", ")}`);
  assert.ok(!fs.existsSync(path.join(root, "public", "ade-experience/README-INTEGRATION.md")), "Public tree does not ship internal integration notes");
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
    for (const p of [
      "/ade-experience/media/Try_again(3).mp4",
      "/ade-experience/media-manifest.json"
    ]) {
      const privateAsset = await fetch(base + p);
      assert.equal(privateAsset.status, 401, `private source media stays L2-gated: ${p}`);
    }
    for (const p of [
      "/index.html.activation-audit-20260918-121148.bak",
      "/ade-experience/README-INTEGRATION.md"
    ]) {
      const retired = await fetch(base + p);
      assert.equal(retired.status, 404, `retired public path fails closed: ${p}`);
    }
  } finally {
    srv.close();
  }
});
