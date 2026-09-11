import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { app, kernelReady } from "../src/app.js";
import IdentityOnboarding from "../src/kernel/IdentityOnboarding.js";

// Intake validation matrix + partner->pilot->verdict chain + secret safety.
// Local mode only (no VERCEL env): mutations must succeed and persist.

const PREFIX = `T${Date.now().toString(36).toUpperCase()}`;
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
  // Remove exactly the records this file created (offline hygiene).
  try {
    const file = path.resolve("data/runtime-config/admin.json");
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const section of ["communityIntakes", "pilots", "cases", "partners", "connections"]) {
      if (!Array.isArray(doc[section])) continue;
      doc[section] = doc[section].filter((row) => {
        const org = row.organization ?? row.name ?? row.contact?.organization ?? row.provider ?? "";
        return !String(org).includes(PREFIX);
      });
    }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch {}
});

const opToken = () =>
  IdentityOnboarding.getInstance().issueSession({
    subject: `matrix-op-${PREFIX}`,
    tier: "COMMUNITY",
    level: 2,
    persona: "OPERATOR"
  }).token;

const post = (url, body, token) =>
  fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });

const get = (url, token) =>
  fetch(`${baseUrl}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

test("founder tab routing is complete and consistent", () => {
  const html = fs.readFileSync(path.resolve("public/founder.html"), "utf8");
  const tabs = ["OVERVIEW", "INBOX", "WORKFORCE", "PILOTS", "PARTNERS", "INTEGRATIONS", "FEATURE CONTROL", "PRODUCT THEATER", "ANNOUNCEMENTS", "AUDIT"];
  for (const t of tabs) assert.ok(html.includes(`'${t}'`), `TABS must include ${t}`);
  for (const t of ["TAB_OVERVIEW", "TAB_INBOX", "TAB_WORKFORCE", "TAB_PILOTS", "TAB_PARTNERS", "TAB_INTEGRATIONS", "TAB_FEATURES", "TAB_THEATER", "TAB_ANNOUNCEMENTS", "TAB_AUDIT"]) {
    assert.ok(html.includes(`const ${t}=`), `${t} renderer must exist`);
  }
  assert.ok(html.includes("INBOX:TAB_INBOX"), "tabContent must map INBOX");
  // refreshAll Promise.all arity: count j( urls ) equals destructured vars
  const m = html.match(/const \[([^\]]+)\]=await Promise\.all\(\[\s*([\s\S]*?)\]\);/);
  assert.ok(m, "refreshAll Promise.all must exist");
  const vars = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  const urls = (m[2].match(/j\('/g) || []).length;
  assert.equal(vars.length, urls, `refreshAll vars (${vars.length}) must match urls (${urls})`);
});

test("intake matrix: all five types succeed and persist", async () => {
  const token = opToken();
  const before = (await (await get("/api/v1/community/progression")).json()).stats.totalIntakes;
  for (const type of ["USE_CASE", "PILOT_INTEREST", "ENTERPRISE_INTEREST", "PARTNER_INTEREST", "IMPLEMENTATION_NEED"]) {
    const r = await post("/api/v1/community/intake", { type, organization: `${PREFIX}-${type}`, useCaseDescription: `matrix ${type}` });
    assert.equal(r.status, 201, `${type} must be 201`);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.ok(body.intake.intakeId);
  }
  const after = (await (await get("/api/v1/community/progression")).json()).stats.totalIntakes;
  assert.equal(after - before, 5, "all five intakes must persist");
  const att = await (await get("/api/v1/attention", token)).json();
  assert.ok(att.attention.intakes.some((i) => String(i.organization).includes(PREFIX)), "attention must surface new intakes");
});

test("intake matrix: unknown type normalizes, never crashes", async () => {
  const r = await post("/api/v1/community/intake", { type: "NOPE_UNKNOWN", organization: `${PREFIX}-unknown`, useCaseDescription: "x" });
  assert.equal(r.status, 201);
});

test("partner->pilot->verdict chain with founder actor", async () => {
  const token = opToken();
  const org = `${PREFIX}-ChainPartner`;
  const p = await post("/api/v1/admin/partners", { name: org, status: "EVALUATION", capabilities: ["PROCARTA"], contact: { person: "Lead" } }, token);
  assert.equal(p.status, 201);
  const exec = await post("/api/command/execute", { action: "PROCARTA_EXECUTE", payload: { text: `${org} needs inventory integration with ERPNext`, organization: org, systems: ["erpnext"], workflows: ["inventory"] } }, token);
  assert.equal(exec.status, 200);
  const cands = await (await get("/api/v1/procarta/pilot-candidates", token)).json();
  const cand = cands.candidates.find((c) => c.organization === org);
  assert.ok(cand, "candidate must exist");
  const appr = await post("/api/v1/procarta/pilot/approve", { intakeId: cand.intakeId, reason: "matrix approval" }, token);
  assert.equal(appr.status, 201);
  const reg = await (await get("/api/v1/procarta/pilot/registry", token)).json();
  const rec = reg.records.find((r) => r.intakeId === cand.intakeId);
  assert.equal(rec?.state, "EVALUATION");
  const verd = await post("/api/v1/procarta/pilot/verdict", { recordId: rec.id, verdict: "PROMOTED", reason: "matrix evidence" }, token);
  assert.equal(verd.status, 201);
  assert.equal((await verd.json()).record.state, "PROMOTED");
  const dbl = await post("/api/v1/procarta/pilot/verdict", { recordId: rec.id, verdict: "ARCHIVED", reason: "x" }, token);
  assert.equal(dbl.status, 409);
});

test("connection secrets are stored but never returned", async () => {
  const token = opToken();
  const secret = `matrix-secret-${PREFIX}`;
  const c = await post("/api/v1/admin/connections", { provider: `${PREFIX}-prov`, baseUrl: "https://example.com", secret }, token);
  assert.equal(c.status, 201);
  assert.equal((await c.json()).connection.secretConfigured, true);
  const list = await (await get("/api/v1/admin/connections", token)).text();
  assert.ok(!list.includes(secret), "secret must never appear in list responses");
});

test("diagnostics and attention require auth and leak no values", async () => {
  const anon = await get("/api/v1/system/diagnostics");
  assert.equal(anon.status, 401);
  const anon2 = await get("/api/v1/attention");
  assert.equal(anon2.status, 401);
  const diag = await (await get("/api/v1/system/diagnostics", opToken())).text();
  assert.ok(!/BEGIN PRIVATE|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{8,}/.test(diag), "diagnostics must not leak key material");
});
