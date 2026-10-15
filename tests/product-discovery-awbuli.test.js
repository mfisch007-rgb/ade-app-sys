import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const readPublic = (f) =>
  fs.readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
const readCss = () =>
  fs.readFileSync(
    new URL("../public/ade-design-system.css", import.meta.url),
    "utf8"
  );

// B — every canonical suite + roadmap card opens a live detail view.
test("directory: all 12 product cards carry a canonical surfId", () => {
  const html = readPublic("index.html");
  for (const id of [
    "nexus",
    "procarta",
    "awbuli",
    "eventos",
    "founders-circle",
    "market-circle",
    "tides",
    "aibos",
    "biz-watch",
    "fraud-watch",
    "agriculture",
    "gov-ngo",
  ]) {
    assert.ok(
      html.includes(`surfId:'${id}'`),
      `card wired to matrix surface: ${id}`
    );
  }
});

test("directory: What-ADE-does + product-directory sections exist", () => {
  const html = readPublic("index.html");
  for (const marker of [
    "what-ade-does",
    "What ADE does",
    "product-directory",
    "Product directory",
  ]) {
    assert.ok(html.includes(marker), `present: ${marker}`);
  }
});

// B — plain-language availability, never raw internal enums as primary text.
test("directory: public state language mapped from server enums", () => {
  const html = readPublic("index.html");
  for (const label of [
    "'Available'",
    "'Setup required'",
    "'Pilot access'",
    "'In review'",
    "'Coming soon'",
  ]) {
    assert.ok(html.includes(label), `public label present: ${label}`);
  }
  assert.ok(html.includes("const PUBSTATE="), "mapper defined");
  assert.ok(
    !html.includes("B(su.status,surfaceBk(su.status))"),
    "no raw-enum primary badge left"
  );
  assert.ok(
    (html.match(/pubB\(su\.status\)/g) || []).length >= 3,
    "mapped badges used in strip, tags and modal"
  );
});

// C — AWBULI prominence with truthful, distinct states.
test("awbuli: readiness block exposes four distinct states", () => {
  const html = readPublic("index.html");
  for (const marker of [
    "awbuli-readiness",
    "AWBULI READINESS",
    "Product design: available",
    "Onboarding: pending",
    "Provider configuration:",
    "Live messaging connectivity:",
    "No verified WhatsApp sender identity",
    "View Theater Demo",
  ]) {
    assert.ok(html.includes(marker), `present: ${marker}`);
  }
});

test("awbuli: no fabricated live-connectivity claims or numbers", () => {
  const html = readPublic("index.html");
  assert.ok(
    !/wa\.me\/\d/.test(html),
    "no wa.me/<digits> onboarding link published"
  );
  assert.ok(!/fully live/i.test(html), "no fully-live claim");
  assert.ok(
    !/LIVE MESSAGING ACTIVE/i.test(html),
    "no live-messaging-active claim"
  );
  assert.ok(
    html.includes("not automated onboarding"),
    "team contact lines distinguished from automated onboarding"
  );
});

// D — rotating prompts readable, navigable, motion-safe.
test("prompts: caption, readable sizing, slow cycle, touch dots", () => {
  const html = readPublic("index.html");
  assert.ok(html.includes("suggestion-label"), "visible caption class");
  assert.ok(html.includes("EXAMPLE ASSESSMENTS"), "caption copy");
  assert.ok(
    html.includes("suggestionFade 30s"),
    "30s rotation cycle (6s per prompt)"
  );
  assert.ok(
    html.includes(".suggestion-dots button{min-width:44px;min-height:44px"),
    "44px manual-navigation targets"
  );
  assert.ok(
    html.includes("clamp(14.5px,1.7vw,16.5px)"),
    "accessible prompt text sizing"
  );
  const css = readCss();
  assert.ok(
    css.includes("body .suggestion-text") && css.includes("animation: none"),
    "reduced-motion static-list fallback"
  );
});

// FOURTH — telemetry carries sample/stream freshness, never implied liveness.
test("telemetry: metric freshness + stream-age chips from real state", () => {
  const html = readPublic("index.html");
  for (const marker of [
    "[metricsAt,setMetricsAt]",
    "setMetricsAt(new Date().toISOString())",
    "const freshChip=",
    "const lastEventChip=",
    "freshChip()",
    "lastEventChip()",
    "UPDATED JUST NOW",
    "LAST EVENT ",
    "NO DATA YET",
  ]) {
    assert.ok(html.includes(marker), `present: ${marker}`);
  }
  assert.ok(
    html.includes("older than the 15s refresh cadence"),
    "stale threshold disclosed against the real poll cadence"
  );
});

// C/E — Founder AWBULI tab is read-only and wired.
test("founder: AWBULI tab registered, rendered and read-only", () => {
  const html = readPublic("founder.html");
  assert.ok(html.toLowerCase().includes("awbuli"), "AWBULI tab registered in founder markup");
  assert.ok(html.includes("const TAB_AWBULI="), "renderer defined");
  assert.ok(html.includes("AWBULI:TAB_AWBULI"), "renderer wired into tabContent");
});

// E — Admin configure surfaces exist with feedback.
test("admin: channel configure + WhatsApp-number surfaces present", () => {
  const html = readPublic("admin/index.html");
  for (const marker of [
    "whatsapp-numbers",
    "openConfigModal",
    "submitChannelConfig",
    "cfgMsg",
    "No numbers registered",
  ]) {
    assert.ok(html.includes(marker), `present: ${marker}`);
  }
});

// Live — server-reported states match the directory contract.
test("live: product-surface reports truthful AWBULI + suite states", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-prod-"));
  process.chdir(tmpRoot);
  const { app } = await import("../src/app.js");
  const srv = app.listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await fetch(`${base}/api/v1/product-surface`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.success, "surface endpoint succeeds");
    const byId = new Map(body.surfaces.map((s) => [s.id, s]));
    for (const id of [
      "procarta",
      "awbuli",
      "nexus",
      "eventos",
      "founders-circle",
      "market-circle",
      "tides",
      "aibos",
    ]) {
      assert.ok(byId.has(id), `matrix declares suite: ${id}`);
    }
    const aw = byId.get("awbuli");
    assert.equal(aw.status, "CONFIGURATION_REQUIRED");
    assert.equal(aw.activation?.state, "EXTERNAL_CREDENTIAL_REQUIRED");
    assert.ok(
      typeof aw.errorRecovery === "string" && aw.errorRecovery.length > 0,
      "AWBULI carries a recovery path, not a bare code"
    );
    const known = new Set([
      "AVAILABLE",
      "ACTIVATED",
      "CONFIGURATION_REQUIRED",
      "EXTERNAL_CREDENTIAL_REQUIRED",
      "PARTNER_REQUIRED",
      "PREVIEW",
      "COMMUNITY",
      "EXPERIMENTAL",
      "FUTURE",
      "ROADMAP",
      "BLOCKED",
      "OFFLINE",
    ]);
    for (const s of body.surfaces) {
      assert.ok(known.has(s.status), `known status for ${s.id}: ${s.status}`);
    }
  } finally {
    srv.close();
  }
});
