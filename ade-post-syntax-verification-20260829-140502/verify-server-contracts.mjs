import fs from "node:fs";

const source = fs.readFileSync("./src/server.js", "utf8");

const requiredFragments = [
  'import CapabilityRegistry from "./core/CapabilityRegistry.js";',
  'import { executeCapability } from "./core/CapabilityExecutor.js";',
  "app.get('/api/v1/capabilities'",
  "CapabilityRegistry.listCapabilities",
  "CapabilityRegistry.getSubsystems",
  "app.post('/api/v1/intake/:channel'",
  'app.post("/api/command/execute"',
  "executeCapability(CapabilityRegistry, action, payload)",
  "EXECUTED_BY_CAPABILITY_REGISTRY",
  "DISPATCHED_TO_KERNEL",
  "NO_EXECUTION_TARGET",
  "// GATE 5: Real-time SSE Stream"
];

const missing = [];

for (const fragment of requiredFragments) {
  if (!source.includes(fragment)) {
    missing.push(fragment);
  } else {
    console.log(`PASS contract: ${fragment}`);
  }
}

if (missing.length > 0) {
  console.error("");
  console.error("FAIL missing required reconciliation contracts:");

  for (const fragment of missing) {
    console.error(` - ${fragment}`);
  }

  process.exit(1);
}

console.log("");
console.log("PASS all required reconciliation server contracts remain present.");
