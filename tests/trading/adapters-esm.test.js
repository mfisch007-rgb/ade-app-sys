import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { openWebSocket } from "../../src/trading/adapters/WebSocketTransport.js";
import { IQOptionAdapter } from "../../src/trading/adapters/IQOptionAdapter.js";
import { PocketOptionAdapter } from "../../src/trading/adapters/PocketOptionAdapter.js";

const root = path.resolve(import.meta.dirname, "../..");

test("broker adapter modules load under ESM and expose their canonical classes", () => {
  assert.equal(typeof IQOptionAdapter, "function");
  assert.equal(typeof PocketOptionAdapter, "function");
  assert.equal(typeof openWebSocket, "function");
});

test("broker adapters no longer call require() from ES modules", () => {
  const files = [
    "src/trading/adapters/IQOptionAdapter.js",
    "src/trading/adapters/PocketOptionAdapter.js",
    "src/trading/MarketDataAdapter.js"
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.doesNotMatch(source, /\brequire\s*\(/, `${relative} still uses require()`);
  }
});

test("WebSocket transport reports unavailability instead of throwing on an empty URL", async () => {
  assert.equal(await openWebSocket(""), null);
});
