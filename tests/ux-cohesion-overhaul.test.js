import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// UX-UI COHESION OVERHAUL — behavior contracts for the experience-architecture
// repair. Static-surface assertions pin the exact defects fixed:
//  1. Founder elevation session-wipe race (stale in-flight base-token 401 must
//     never clear the fresh elevated token).
//  2. Canonical path → section resolution (URL → correct surface on direct
//     load / refresh), with hash contract preserved.
//  3. PROCARTA CTA coherence (in-form submit is "Start Assessment", not a
//     self-referential "Try PROCARTA").
//  4. Intake → canonical notification (public assessment reaches the
//     Admin/Founder inbox via ProductNotificationEngine, no new system).
//  5. brand-mark.png mobile rendering (contain, no cover-crop).

const indexHtml = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const founderHtml = fs.readFileSync(new URL("../public/founder.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("founder: stale in-flight requests cannot wipe the live elevated session", () => {
  assert.ok(founderHtml.includes("tokenRef"), "live token mirror present");
  assert.ok(founderHtml.includes("usedToken"), "request token captured at call time");
  assert.ok(
    founderHtml.includes("usedToken!==tokenRef.current"),
    "session wipe guarded by live-token comparison"
  );
  // Founder elevation still mirrors to the shared key for Account & Security.
  assert.ok(founderHtml.includes("ade_founder_token"), "founder token key intact");
  assert.ok(founderHtml.includes("/api/v1/account/pin"), "founder PIN step-up endpoint intact");
  assert.ok(founderHtml.includes("/api/v1/auth/pin"), "admin recovery endpoint intact and separate");
});

test("public: canonical paths resolve to the correct section on direct load", () => {
  assert.ok(indexHtml.includes("sectionFromPath"), "path-derived section resolver present");
  assert.ok(indexHtml.includes("PATH_SECTION"), "canonical path map present");
  for (const [path, section] of [
    ["'/procarta'", "PROCARTA"],
    ["'/workspace'", "Workspace"],
    ["'/awbuli'", "Products"],
    ["'/connect'", "Products"],
    ["'/community'", "Community"],
    ["'/pilot'", "Community"],
    ["'/signin'", "Account"]
  ]) {
    assert.ok(indexHtml.includes(`${path}:'${section}'`), `canonical alias ${path} → ${section}`);
  }
  // Hash contract preserved: existing deep links keep working.
  assert.ok(indexHtml.includes("sectionFromHash"), "hash resolver intact");
  assert.ok(indexHtml.includes("popstate"), "Back/Forward handling intact");
});

test("server: canonical experience aliases serve the SPA shell", () => {
  for (const alias of ["/workspace", "/procarta", "/awbuli", "/connect", "/pilot", "/signin", "/join"]) {
    assert.ok(appJs.includes(`"${alias}"`), `server alias ${alias} registered`);
  }
  assert.ok(appJs.includes("app.get('/admin'"), "admin console route intact");
  assert.ok(appJs.includes("founder.html"), "founder command center route intact");
});

test("procarta: in-form submit CTA is unambiguous", () => {
  assert.ok(indexHtml.includes("try-procarta-submit"), "submit testid preserved");
  assert.ok(indexHtml.includes("Start Assessment"), "canonical primary CTA label present");
  assert.ok(
    !indexHtml.includes("try-procarta-submit',onClick:submitProcarta,disabled:pBusy},pBusy?'Submitting...':'Try PROCARTA'"),
    "in-form submit no longer masquerades as a navigation CTA"
  );
});

test("intake: public submissions raise a canonical internal notification", () => {
  assert.ok(
    appJs.includes('generateInternalEvent("notification.request_status"'),
    "intake publishes via the canonical ProductNotificationEngine"
  );
  assert.ok(appJs.includes('recommendedAction:"REVIEW"'), "notification carries operator next action");
  const instantiations = (appJs.match(/new ProductNotificationEngine/g) || []).length;
  assert.equal(instantiations, 1, "exactly one canonical notification engine — no duplicate system");
});

test("brand-mark: technology-hub visual renders without cover-crop on mobile", () => {
  assert.ok(indexHtml.includes("/brand-mark.png"), "asset reference intact");
  assert.ok(
    indexHtml.includes("Tech in Africa — African technology hubs"),
    "accessible alt text intact"
  );
  assert.ok(indexHtml.includes("hubVisual"), "targeted responsive class present");
  assert.ok(indexHtml.includes("objectFit:'contain'"), "contain fit prevents mobile cropping");
  assert.ok(
    !indexHtml.includes("src:'/brand-mark.png',alt:'Tech in Africa — African technology hubs',style:{width:'100%',maxWidth:340,height:120,objectFit:'cover'"),
    "cover-crop defect removed"
  );
});
