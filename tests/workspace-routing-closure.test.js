import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// WORKSPACE ROUTING CLOSURE — every module id advertised in WS_MODULES must
// resolve to its own panel in wsPanel(). A missing case silently renders the
// Overview panel under the wrong label (wrong-target defect).

const ROOT = path.resolve(".");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

function moduleIds() {
  const m = html.match(/const WS_MODULES=\{([\s\S]*?)\n\s{1,4}\};/);
  assert.ok(m, "WS_MODULES registry required");
  const ids = new Set();
  for (const hit of m[1].matchAll(/id:'([a-z]+)'/g)) ids.add(hit[1]);
  return [...ids];
}

function switchCases() {
  const m = html.match(/const wsPanel=\(\)=>\{[\s\S]*?switch\(wsModule\)\{([\s\S]*?)default:/);
  assert.ok(m, "wsPanel switch required");
  const cases = new Set();
  for (const hit of m[1].matchAll(/case '([a-z]+)'/g)) cases.add(hit[1]);
  return cases;
}

test("MODULE-ROUTING-1 — every advertised workspace module id has a dedicated panel case", () => {
  const cases = switchCases();
  const missing = moduleIds().filter((id) => !cases.has(id));
  assert.deepEqual(missing, [], `modules without a panel case (would render Overview under the wrong label): ${missing.join(", ")}`);
});

test("MODULE-ROUTING-2 — Connect/Inbox route to their own panels, never the Overview fallback", () => {
  const body = html.match(/const wsPanel=\(\)=>\{[\s\S]*?switch\(wsModule\)\{([\s\S]*?)default:/)[1];
  assert.ok(/case 'connections':return wsConnectionsPanel\(\)/.test(body), "connections must render wsConnectionsPanel");
  assert.ok(/case 'inbox':return wsInboxPanel\(\)/.test(body), "inbox must render wsInboxPanel");
});

test("MODULE-ROUTING-3 — founder console: every visible TAB has a render function in tabContent", () => {
  const founder = fs.readFileSync(path.join(ROOT, "public/founder.html"), "utf8");
  const tabs = [...founder.match(/const TABS=\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const map = founder.match(/const tabContent=\{([^}]+)\}/)[1];
  const missing = tabs.filter((t) => !map.includes(t.split(" ")[0]));
  assert.deepEqual(missing, [], `tabs without a render entry: ${missing.join(", ")}`);
  assert.ok(/\(tabContent\[tab\]\|\|TAB_OVERVIEW\)\(\)/.test(founder), "unknown tab must fall back to Overview explicitly");
});
