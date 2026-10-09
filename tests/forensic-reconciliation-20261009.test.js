import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, kernelReady } from "../src/app.js";
import { PRODUCT_SURFACE_FRONTEND_ROUTES } from "../src/products/ProductSurfaceMatrix.js";

/**
 * FORENSIC RECONCILIATION 2026-10-09 — regression tests for proven defects.
 * - WS2: canonical slug hashes (no label-derived route state).
 * - WS3: admin channel modal hidden by default, no stale resurrection.
 * - WS4: media request truthfulness (CREATED + PLACEHOLDER + configuration gate).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

let server = null;
let baseUrl = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

// ---- WS2: canonical slug routes ----
test("WS2.A — ProductSurfaceMatrix uses stable slug hashes, not labels", () => {
  for (const [key, route] of Object.entries(PRODUCT_SURFACE_FRONTEND_ROUTES)) {
    if (route.startsWith("#/")) {
      assert.ok(!route.includes(" "), `${key} must not contain a label space: ${route}`);
      assert.ok(!route.includes("%20"), `${key} must not contain encoded spaces: ${route}`);
    }
  }
  assert.equal(PRODUCT_SURFACE_FRONTEND_ROUTES.THEATER, "#/product-theater");
});

test("WS2.B — SPA defines canonical slugs with legacy-label backward compat", () => {
  const html = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
  assert.ok(html.includes("SECTION_SLUGS"), "SECTION_SLUGS map exists");
  assert.ok(html.includes("hashForSection"), "canonical hash writer exists");
  assert.ok(html.includes("SLUG_SECTION"), "slug reverse-lookup exists");
  assert.ok(html.includes("'Product Theater':'product-theater'"), "theater slug mapping exists");
});

// ---- WS3: admin modal ----
test("WS3.A — channel modal is hidden by default (no inline display:flex override)", () => {
  const html = fs.readFileSync(path.join(repoRoot, "public", "admin", "index.html"), "utf8");
  const modalTag = html.match(/<div id="config-modal"[^>]*>/)?.[0] || "";
  assert.ok(modalTag.includes('class="hidden"'), "modal keeps hidden class");
  assert.ok(!modalTag.includes("display:flex"), "modal must not force display:flex inline");
  assert.ok(modalTag.includes("display:none"), "modal defaults to display:none inline");
});

test("WS3.B — modal opens only for authenticated sessions and clears secrets on close", () => {
  const html = fs.readFileSync(path.join(repoRoot, "public", "admin", "index.html"), "utf8");
  assert.ok(html.includes("function openConfigModal(id,label){if(!authState.token)return;"), "modal requires auth token");
  assert.ok(html.includes("clearConfigSecrets"), "secrets are cleared on close");
  assert.ok(html.includes("key==='Escape'"), "Escape closes the modal");
  assert.ok(html.includes("e.target.id==='config-modal'"), "backdrop click closes the modal");
});

test("WS3.C — session teardown closes the modal (setAuthUI guard)", () => {
  const html = fs.readFileSync(path.join(repoRoot, "public", "admin", "index.html"), "utf8");
  assert.ok(html.includes("if(!authed&&typeof closeConfigModal==='function')"), "unauthenticated UI closes modal");
});

// ---- WS4: media truthfulness ----
test("WS4.A — video request returns CREATED + PLACEHOLDER + configuration gate", async () => {
  const res = await fetch(`${baseUrl}/api/v1/media/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "regression video", type: "video", product: "ADE" })
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.request.requestId.startsWith("ADE-MEDIA-"));
  assert.equal(body.request.status, "CREATED");
  assert.equal(body.request.truthClassification, "PLACEHOLDER");
  assert.equal(body.request.renderPipeline.configurationRequired, true);
  assert.equal(body.request.renderPipeline.renderingImplemented, false);
  assert.equal(body.request.renderPipeline.queuedJobId, null);
  assert.equal(body.request.renderPipeline.assetUrl, null);
});

test("WS4.B — each supported type validates and stays CREATED/PLACEHOLDER", async () => {
  for (const type of ["video", "image", "audio", "campaign"]) {
    const res = await fetch(`${baseUrl}/api/v1/media/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `regression ${type}`, type, product: "ADE" })
    });
    assert.equal(res.status, 201, `${type} accepted`);
    const body = await res.json();
    assert.equal(body.request.status, "CREATED", `${type} stays CREATED`);
    assert.equal(body.request.truthClassification, "PLACEHOLDER", `${type} stays PLACEHOLDER`);
  }
});

test("WS4.C — unknown media type is rejected, never silently misclassified", async () => {
  const res = await fetch(`${baseUrl}/api/v1/media/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "bad type", type: "hologram", product: "ADE" })
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
});

test("WS4.D — legacy minimal payload still logs as CREATED/PLACEHOLDER (contract preserved)", async () => {
  const res = await fetch(`${baseUrl}/api/v1/media/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: "ADE", duration: 30, campaignObjective: "DEMO" })
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.request.status, "CREATED");
  assert.equal(body.request.truthClassification, "PLACEHOLDER");
});
