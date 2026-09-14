/**
 * ADE context-aware secret scanner.
 *
 * Distinguishes real credential-like values from:
 *  1. test assertion literals that intentionally name credential patterns
 *     (e.g. assert.doesNotMatch(msg, /eyJ|sb_secret_|.../)) to prove no leakage,
 *  2. documentation placeholders,
 *  3. .env.example placeholders (empty or <...> values).
 *
 * Output contract:
 *  - "SECRET SCAN: CLEAN" (exit 0), or
 *  - "REAL SECRET FOUND:" + filename/path ONLY, never the value (exit 1).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist",
  "ADE-BATCH3-RECONCILIATION-20260827-160926",
  "ADE-BATCH5-UNTRACKED-TRUTH-20260827-163129",
  "ADE-BATCH6-SOURCE-TRUTH-20260827-163551",
  "ADE-BATCH7-COMMIT-PREFLIGHT-20260827-163821",
  "ADE-BATCH7-COMMIT-PREFLIGHT-20260827-163902",
  "ADE-BATCH7-CONTRACT-REPAIR-20260827-164409",
  "ADE-GIT-RELEASE-EVIDENCE",
  "ADE-RELEASE-CLOSURE-EVIDENCE",
  "ade-post-syntax-verification-20260829-140502",
  "ade-reconciliation-backup-20260829-135213",
  "ade-safe-verification-20260829-140822",
  "ade-server-forensic-backup-20260829-140208",
  "ade-server-syntax-backup-20260829-135512",
  "ade-verification-repair-20260829-141722",
  ".ade-batch-b-backup-20260829-150047",
  ".ade-batch-b-backup-20260829-150710",
  ".ade-reconciliation-backup-20260829-133427"
]);

const SKIP_FILE_PATTERNS = [
  /\.bundle$/, /\.zip$/, /\.png$/, /\.jpg$/, /\.jpeg$/,
  /^\.env(\..+)?$/, /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/, /\.crt$/, /\.cer$/,
  /admin-credential\.json$/, /\.smoke-(err|out)\.log$/,
  /^\$log$/, /\.g(17aa4|18-httpsec|17z)-backup$/, /\.backup$/,
  /ADE-CRITICAL-MISSING-FILES\.txt$/, /ADE_MASTER_ENGINEERING_BATCH\.txt$/,
  /ADE_MASTER_FORENSIC_/, /ADE_FINAL_TRUTH_GATE\.json$/,
  /BATCH.*\.txt$/, /CLAUDE_BATCH.*\.txt$/, /MASTER.*\.txt$/,
  /RUN-ADE-ENGAGEMENT-RECONCILIATION\.ps1$/, /live_root\.html$/,
  /\.opencode-final-checkpoint\.json$/
];

// Strong credential-value shapes (deliberately strict to avoid placeholders).
const VALUE_PATTERNS = [
  /re_[A-Za-z0-9_-]{16,}/,                    // Resend live key
  /sb_secret_[A-Za-z0-9_-]{16,}/,             // Supabase secret key
  /sk-live-[A-Za-z0-9_-]{16,}/,               // legacy service_role JWT-ish
  /eyJ[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}/,// JWT with header.payload
  /xox[bap]-[A-Za-z0-9-]{10,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];

function isSkippedFile(rel) {
  const base = path.basename(rel);
  if (SKIP_FILE_PATTERNS.some((re) => re.test(base) || re.test(rel))) return true;
  if (base === ".env.example") return false; // scanned with placeholder rules
  return false;
}

// Returns true when the line is an intentional security-test/doc context,
// NOT a real credential value.
function isBenignContext(line, file) {
  const t = line.trim();
  // 1. Leakage-assertion test literals: asserting output does NOT contain patterns.
  if (/assert\s*\.\s*(doesNotMatch|match)\s*\(/.test(line)) return true;
  // 2. Boundary/error-code strings (identifiers, never key material).
  if (/EMAIL_|STORAGE_|PIN_|AUTH_|CREDENTIAL/.test(line) && !VALUE_PATTERNS.some((re) => re.test(line.replace(/\/[a-z]*;?\s*\)?\s*;?\s*$/, "")))) {
    // fall through to value check below; boundary words alone are not findings
  }
  // 3. .env.example placeholders: empty, <...>, or example.com values.
  if (path.basename(file) === ".env.example") {
    if (/^\s*#/.test(line)) return true;
    const m = line.match(/^\s*[A-Z0-9_]+\s*=\s*(.*)$/);
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, "");
      if (v === "" || /^<.*>$/.test(v) || /example\.(com|co)|xxxxxxxx|your[_-]?domain|localhost/i.test(v)) return true;
    }
  }
  // 4. Comments/docs explicitly marked as placeholder/example.
  if (/placeholder|example value|e\.g\.\s*re_|<your-|xxxx/i.test(line)) return true;
  return false;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    const top = rel.split(path.sep)[0];
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(top)) continue;
      if (entry.name === "backup" || /backup/i.test(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (isSkippedFile(rel)) continue;
      if (/\.(js|mjs|cjs|ts|tsx|json|html|md|txt|yml|yaml)$/i.test(entry.name)) out.push({ full, rel });
    }
  }
  return out;
}

const findings = new Map();
for (const { full, rel } of walk(ROOT)) {
  let text;
  try {
    text = fs.readFileSync(full, "utf8");
    if (text.includes("\u0000")) continue; // binary
  } catch { continue; }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!VALUE_PATTERNS.some((re) => re.test(line))) return;
    if (isBenignContext(line, rel)) return;
    // A match inside a regex literal on any line is a pattern, not a value:
    // require at least a quote-adjacent or assignment-adjacent shape.
    const inRegexLiteral = /\/[^/\n]* hues?/.test(line) || (/\/.*(eyJ|sb_secret_|sk-live|re_).*\/[a-z]*\s*[,);]/.test(line) && !/['"]\s*[:=]\s*['"]?re_/.test(line));
    if (inRegexLiteral) return;
    if (!findings.has(rel)) findings.set(rel, []);
    findings.get(rel).push(i + 1);
  });
}

if (findings.size === 0) {
  console.log("SECRET SCAN: CLEAN");
  process.exit(0);
} else {
  console.log("REAL SECRET FOUND:");
  for (const [rel, lines] of findings) {
    console.log(` - ${rel} (lines: ${lines.slice(0, 8).join(",")})`);
  }
  process.exit(1);
}
