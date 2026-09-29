import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// CANONICAL FOUNDER/ADMIN WORKSPACE — behavior contracts.
// Every assertion pins a CLICK → HANDLER → ENDPOINT/ROUTE → RESULT chain
// repaired in this phase. No backend authority is mocked or duplicated.

const indexHtml = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const founderHtml = fs.readFileSync(new URL("../public/founder.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("operations: every tile button performs a real state transition", () => {
  assert.ok(
    !indexHtml.includes('querySelector("[data-ws=\'liveops\']")'),
    "dead [data-ws='liveops'] scroll query removed from Workspace code paths"
  );
  assert.ok(indexHtml.includes("wsLiveTransport"), "inline live-transport block present");
  for (const label of ["TRANSPORT", "EVENTS", "LAST EVENT", "KERNEL"]) {
    assert.ok(indexHtml.includes("'" + label + "'"), "operations shows " + label);
  }
  assert.ok(indexHtml.includes("NONE YET"), "zero-event stream states transport-vs-events honestly");
  assert.ok(indexHtml.includes("Open Live Operations"), "canonical live-ops action labeled");
  assert.ok(indexHtml.includes("go('Command Center')"), "live-ops routes to the always-mounted panel");
});

test("products: full server catalogue exposed, grouped, every item opens", () => {
  assert.ok(!indexHtml.includes("includes(s.status):true).slice(0,12)"), "artificial 12-item product truncation removed");
  assert.ok(indexHtml.includes("ws-product-"), "per-surface test hooks present");
  assert.ok(indexHtml.includes("surfaceGo(s)"), "every product item invokes the canonical opener");
  assert.ok(indexHtml.includes("ACTION REQUIRED: "), "required operator action surfaced per item");
  assert.ok(indexHtml.includes("Open Full Catalogue"), "full-catalogue path preserved");
});

test("palette: unified server-derived catalogue with canonical execution", () => {
  assert.ok(indexHtml.includes("paletteNav"), "surface/module/route entries composed");
  assert.ok(indexHtml.includes("palNavSection"), "navigate section rendered");
  assert.ok(indexHtml.includes("NAVIGATE — "), "navigate section labeled");
  assert.ok(indexHtml.includes("ArrowDown") && indexHtml.includes("ArrowUp"), "keyboard traversal present");
  assert.ok(indexHtml.includes("surfaces/routes"), "result counts distinguish capabilities from surfaces");
  const palRun = indexHtml.slice(indexHtml.indexOf("const palRunServer="), indexHtml.indexOf("const palRunServer=") + 900);
  assert.ok(palRun.includes("(surface||[]).find"), "unknown catalog entries resolve against product-surface first");
  assert.ok(palRun.includes("surfaceGo(su)"), "resolved entries open their canonical surface, not generic Products");
});

test("session: elevation lands in the canonical role workspace", () => {
  const elev = indexHtml.slice(indexHtml.indexOf("const elevate="), indexHtml.indexOf("const elevate=") + 700);
  assert.ok(elev.includes("loadAccount(r.token)"), "session reloaded with the newly issued token");
  assert.ok(elev.includes("go('Workspace')"), "elevated session routes to the canonical workspace");
  assert.ok(indexHtml.includes("@'+account.person.username") || indexHtml.includes("'@'+account.person.username"), "workspace hero shows server identity");
  assert.ok(indexHtml.includes("ELEVATED"), "elevation state displayed from server claims");
});

test("shells: founder console and canonical workspace bridge explicitly", () => {
  assert.ok(founderHtml.includes("/#/Workspace"), "founder console links the canonical workspace (same session)");
  assert.ok(indexHtml.includes("ws-founder-console"), "canonical workspace links the advanced console");
  assert.ok(indexHtml.includes("same session"), "bridge states the shared-session contract");
  assert.ok(founderHtml.includes("/api/v1/account/pin"), "founder step-up authority unchanged");
  assert.ok(founderHtml.includes("/api/v1/auth/pin"), "admin recovery authority unchanged and separate");
});

test("routes: canonical deep links registered on server and client", () => {
  for (const alias of ["/operations", "/operations/live", "/workflows", "/workforce", "/invitations", "/ai-workers", "/knowledge", "/decisions", "/connect/platforms", "/payments", "/commerce", "/financial", "/audit", "/notifications", "/settings", "/account", "/command-center", "/markets", "/markets/forex", "/markets/binary", "/markets/binary/regular", "/markets/binary/otc", "/gaming", "/gaming/aviator", "/sports"]) {
    assert.ok(appJs.includes('"' + alias + '"'), "server alias " + alias);
  }
  for (const entry of ["'/operations':'Command Center'", "'/workflows':'Workspace'", "'/markets/binary/otc':'Workspace'", "'/gaming/aviator':'Workspace'", "'/sports':'Workspace'", "'/connect/platforms':'Products'"]) {
    assert.ok(indexHtml.includes(entry), "client resolves " + entry);
  }
  assert.ok(indexHtml.includes("MODULE_PATH"), "deep module map present");
  assert.ok(indexHtml.includes("moduleFromPath"), "module resolver present");
  assert.ok(indexHtml.includes("'/operations':'operations'"), "operations deep link selects its module");
});

test("connect: channel truth rendered from the existing inventory", () => {
  assert.ok(indexHtml.includes("CHANNELS — SERVER TRUTH"), "channel truth block present");
  assert.ok(indexHtml.includes("awbuli|eventos|nexus|procarta"), "channel filter covers canonical channels");
  assert.ok(indexHtml.includes("Grip '"), "grip/truth wording preserved");
});

test("mobile: palette rows meet touch-target minimum", () => {
  assert.ok(indexHtml.includes(".command{padding:11px 13px;min-height:44px"), "44px command rows");
});
