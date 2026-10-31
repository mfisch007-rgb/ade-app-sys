import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, test } from "node:test";

/**
 * Minimal Jest-compatible globals for the legacy TypeScript foundation suite.
 * It maps the small assertion surface that suite uses onto node:test, so the
 * file runs on the canonical Node 24 test runner without a Jest install.
 */

globalThis.describe = describe;
globalThis.test = test;
globalThis.before = before;
globalThis.beforeEach = beforeEach;
globalThis.afterEach = afterEach;

globalThis.expect = function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toThrow(expected) {
      if (expected === undefined) {
        assert.throws(actual);
        return;
      }
      assert.throws(actual, (error) => String(error?.message || "").includes(String(expected)));
    }
  };
};
