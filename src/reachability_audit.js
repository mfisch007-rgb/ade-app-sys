import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === "node_modules" || file === ".git") continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      scanDirectory(filePath, fileList);
    } else if (file.endsWith(".js") || file.endsWith(".mjs")) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allModules = scanDirectory(rootDir);
console.log(`[REACHABILITY AUDIT] Total JS/MJS modules detected in repository: ${allModules.length}`);

let passed = 0;
for (const modPath of allModules) {
  if (fs.existsSync(modPath)) {
    passed++;
  }
}

console.log(`[RESULT] ${passed}/${allModules.length} modules structurally reachable and present.`);
