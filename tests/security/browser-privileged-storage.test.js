import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

const sensitiveKeys = [
  "ade_token",
  "ade_founder_token",
  "ade_admin_token",
  "ade_active_pin",
  "ade_lab_token",
  "ade_founder_identity",
  "ade_founder_session_meta"
];

const surfaces = [
  "public/index.html",
  "public/founder.html",
  "public/market-lab.html",
  "public/admin/index.html",
  "public/js/ade-pin-state.js",
  "public/js/ade-api-client.js",
  "public/js/channels.js"
];

test("privileged browser state is never written to localStorage", () => {
  for (const relative of surfaces) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    for (const key of sensitiveKeys) {
      const writePattern = new RegExp(
        `localStorage\\.setItem\\(\\s*['"]${key}['"]`
      );
      assert.equal(
        writePattern.test(source),
        false,
        `${relative} still writes ${key} to localStorage`
      );
    }
  }
});

test("PIN elevation mirror is session-scoped and clears the legacy local copy", () => {
  const source = fs.readFileSync(
    path.join(root, "public/js/ade-pin-state.js"),
    "utf8"
  );
  assert.match(source, /safeSet\(sessionStorage, KEY, s\)/);
  assert.match(source, /safeDel\(localStorage, KEY\)/);
  assert.doesNotMatch(source, /safeSet\(localStorage, KEY, s\)/);
});

test("remote runtime scripts are pinned to exact versions with SRI", () => {
  const files = [
    "public/index.html",
    "public/founder.html",
    "public/market-lab.html",
    "public/procarta-onboarding.html"
  ];

  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    const remoteScripts = [...source.matchAll(/<script\b[^>]*src="https:\/\/[^"]+"[^>]*>/g)];
    assert.ok(remoteScripts.length > 0, `${relative} should load its runtime scripts`);
    for (const [tag] of remoteScripts) {
      assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, `${relative} remote script lacks SRI: ${tag}`);
      assert.match(tag, /crossorigin="anonymous"/, `${relative} remote script lacks crossorigin: ${tag}`);
      assert.doesNotMatch(tag, /react@18\/|react-dom@18\/|@babel\/standalone@7\//, `${relative} uses an unpinned runtime: ${tag}`);
    }
  }
});
