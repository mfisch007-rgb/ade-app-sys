import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const required = [
  "src/kernel/EnterpriseKernelMaster.js","src/kernel/EnterpriseEventBus.js","src/core/CapabilityRegistry.js","src/kernel/PluginRegistry.js","src/ai/UniversalAIGateway.js","src/server.js",
  "src/kernel/IdentityOnboarding.js","src/kernel/ScenarioEngine.js","src/kernel/FeedbackPipeline.js","src/kernel/ADE_ICX_Engine.js","lib/core/demoGuard.js","public/index.html","api/index.js","vercel.json","scripts/build-community.mjs"
];

test("release surface exists", () => { for (const file of required) assert.ok(fs.existsSync(path.join(root,file)), file); });

test("canonical JavaScript surface parses", () => {
  for (const file of required.filter(f => f.endsWith(".js") || f.endsWith(".mjs"))) execFileSync(process.execPath,["--check",path.join(root,file)],{stdio:"pipe"});
});

test("community build produces verified artifact", () => {
  execFileSync(process.execPath,["scripts/build-community.mjs"],{stdio:"pipe"});
  const artifact=path.join(root,"dist","ade-community-edition.zip"); const manifest=path.join(root,"dist","build-manifest.json");
  assert.ok(fs.statSync(artifact).size>0); const m=JSON.parse(fs.readFileSync(manifest,"utf8")); assert.equal(m.size_bytes,fs.statSync(artifact).size); assert.match(m.sha256_hash,/^[a-f0-9]{64}$/);
});
