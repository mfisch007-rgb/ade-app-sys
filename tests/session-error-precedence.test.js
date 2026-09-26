import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// STEP-2C regression: public/index.html session-verify catch guard must group
// the auth-message disjunction explicitly. `&&` binds tighter than `||`, so
// the ungrouped form `!cancelled && A || B` clears the session even after the
// effect was cancelled whenever the error mentions 401.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

// Intended predicate, mirroring the grouped expression in the page.
function shouldClearSession(cancelled, message) {
  return !cancelled && ((message || "").includes("Authentication") || (message || "").includes("401"));
}

test("SESSION-PRECEDENCE — grouped guard clears session only when live and auth-related", () => {
  assert.equal(shouldClearSession(false, "Authentication failed"), true);
  assert.equal(shouldClearSession(false, "Request failed 401"), true);
  assert.equal(shouldClearSession(false, "Network down"), false);
  // The historical bug: cancelled effect + 401 message still cleared state.
  assert.equal(shouldClearSession(true, "Request failed 401"), false);
  assert.equal(shouldClearSession(true, "Authentication failed"), false);
});

test("SESSION-PRECEDENCE — page source contains the explicitly grouped guard", () => {
  assert.ok(
    html.includes("if(!cancelled&&((e.message||'').includes('Authentication')||(e.message||'').includes('401')))"),
    "expected grouped catch guard in public/index.html"
  );
  assert.ok(
    !html.includes("if(!cancelled&&(e.message||'').includes('Authentication')||(e.message||'').includes('401'))"),
    "ungrouped guard must not remain in public/index.html"
  );
});
