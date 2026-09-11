/**
 * OFFLINE synthetic-data hygiene utility (dry-run by default).
 *
 * - Operates ONLY on an explicitly selected local RuntimeConfigStore file.
 * - Requires explicit --ids and/or --orgs (exact identifiers / organization names).
 * - Defaults to dry-run: shows exactly what WOULD be removed.
 * - Refuses ambiguous or empty matchers; never performs broad "delete all".
 * - Never exposes a public HTTP endpoint; never runs automatically.
 * - Never touches production over the network.
 *
 * Usage:
 *   node scripts/cleanup-synthetic-data.mjs --file data/runtime-config/admin.json --orgs "HTTP Pilot Org,Registry Pilot Co" [--ids "abc123"] [--apply]
 */
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) {
      const key = cur.slice(2);
      const next = arr[i + 1];
      acc.push([key, next && !next.startsWith("--") ? next : "true"]);
    }
    return acc;
  }, [])
);

const file = path.resolve(args.file || "data/runtime-config/admin.json");
const orgs = String(args.orgs || "").split(",").map((s) => s.trim()).filter(Boolean);
const ids = String(args.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
// --apply must be passed explicitly; otherwise dry-run only.
const doApply = process.argv.includes("--apply");

if (orgs.length === 0 && ids.length === 0) {
  console.error("REFUSED: provide --orgs and/or --ids with exact values. Nothing to do.");
  process.exit(2);
}

if (!fs.existsSync(file)) {
  console.error(`REFUSED: file not found: ${file}`);
  process.exit(2);
}

const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const matchOrg = (v) => orgs.includes(String(v || ""));
const matchId = (v) => ids.includes(String(v || ""));

const plan = [];
function scanSection(section, getOrg, getId) {
  const rows = Array.isArray(doc[section]) ? doc[section] : [];
  for (const row of rows) {
    const byOrg = getOrg && matchOrg(getOrg(row));
    const byId = getId && matchId(getId(row));
    if (byOrg || byId) plan.push({ section, id: getId ? getId(row) : "?", org: getOrg ? getOrg(row) : "?" });
  }
}

scanSection("communityIntakes", (r) => r.organization, (r) => r.id);
scanSection("pilots", (r) => r.organization, (r) => r.id);
scanSection("cases", (r) => r.organization, (r) => r.id);
scanSection("partners", (r) => r.name || r.contact?.organization, (r) => r.id);
scanSection("connections", (r) => r.provider, (r) => r.id);

if (plan.length === 0) {
  console.log("DRY-RUN: no exact matches found. Nothing would be removed.");
  process.exit(0);
}

console.log(`${doApply ? "APPLY" : "DRY-RUN"}: ${plan.length} exact match(es):`);
for (const p of plan) console.log(` - [${p.section}] id=${p.id} org/name=${p.org}`);

if (!doApply) {
  console.log("Dry-run only. Re-run with --apply to remove exactly these records.");
  process.exit(0);
}

for (const section of ["communityIntakes", "pilots", "cases", "partners", "connections"]) {
  if (!Array.isArray(doc[section])) continue;
  doc[section] = doc[section].filter((row) => {
    const org = row.organization ?? row.name ?? row.contact?.organization ?? row.provider ?? "";
    return !(matchOrg(org) || matchId(row.id));
  });
}
const tmp = `${file}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
fs.renameSync(tmp, file);
console.log(`Removed ${plan.length} record(s) from ${file}.`);
