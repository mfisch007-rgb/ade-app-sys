import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const artifact = path.join(dist, "ade-community-edition.zip");
const manifestPath = path.join(dist, "build-manifest.json");
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "ade-community-"));
fs.mkdirSync(dist, { recursive: true });
for (const file of [artifact, manifestPath]) if (fs.existsSync(file)) fs.rmSync(file, { force: true });

function gitSha() { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "UNAVAILABLE"; } }
function excluded(full, name) {
  return /[\\/]node_modules[\\/]/.test(full) || /[\\/]\.git[\\/]/.test(full) || /[\\/]dist[\\/]/.test(full) || /[\\/]\.keys[\\/]/.test(full) || /(^|[\\/])\.env($|\.)/.test(name) || /\.(pem|key|p12|pfx|crt|cer|der)$/i.test(name) || /credentials|secret/i.test(name) || /^ade_audit_persistence\./i.test(name) || /^\.ade_(capability_store|session_revocations|feedback_queue)/i.test(name);
}
// The excluded() regexes require a trailing separator, so a bare directory
// basename never matches them (e.g. ".git" has no trailing "\"). Skip the
// well-known excluded directory roots here so the walk never descends into the
// git object store, the dependency tree, the dist output, or key material.
const EXCLUDED_DIR_ROOTS = new Set([".git", "node_modules", "dist", ".keys"]);
function walk(dir) {
  const out=[];
  for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,ent.name);
    if (excluded(full,ent.name)) continue;
    if (ent.isDirectory()) {
      if (EXCLUDED_DIR_ROOTS.has(ent.name)) continue;
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}
const files=walk(root);
for (const file of files) {
  const rel=path.relative(root,file);
  const target=path.join(stage,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(file,target);
}

try {
  if (process.platform === "win32") {
    const ps = `$ErrorActionPreference='Stop'; Compress-Archive -Path '${stage.replace(/'/g,"''")}\\*' -DestinationPath '${artifact.replace(/'/g,"''")}' -CompressionLevel Optimal -Force`;
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "inherit" });
  } else {
    execFileSync("zip", ["-qr", artifact, "."], { cwd: stage, stdio: "inherit" });
  }
} finally {
  fs.rmSync(stage,{recursive:true,force:true});
}

const stat=fs.statSync(artifact);
const sha256=crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
const manifest={artifact:"dist/ade-community-edition.zip",relative_path:"dist/ade-community-edition.zip",size_bytes:stat.size,sha256_hash:sha256,build_timestamp:new Date().toISOString(),build_version:process.env.ADE_BUILD_VERSION||"COMMUNITY",commit_sha:gitSha()};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
const verify=crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
if (verify!==manifest.sha256_hash || stat.size<=0) throw new Error("Community build integrity verification failed.");
console.log(JSON.stringify({success:true,artifact,manifest:manifestPath,source_files:files.length,...manifest},null,2));
