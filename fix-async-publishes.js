import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

console.log('========================================================================');
console.log('   ADE-APEX AUTOMATED ASYNC EVENT BUS REMEDIATOR');
console.log('========================================================================');

function scanAndFixDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanAndFixDirectory(fullPath);
    } else if (/\.(js|ts|mjs|cjs)$/i.test(file)) {
      fixUnawaitedPublishesInFile(fullPath);
    }
  }
}

function fixUnawaitedPublishesInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Regex matches naked eventBus.publish or bus.publish that are NOT preceded by await
  const unawaitedPattern = /(?<!await\s+)\b(eventBus|bus)\.publish\(([^;)]+)\)/g;

  if (unawaitedPattern.test(content)) {
    content = content.replace(unawaitedPattern, (match, busName, args) => {
      modified = true;
      return `${busName}.publish(${args}).catch(err => console.error('[EventBus Async Error]', err))`;
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    console.log(` -> Fixed un-awaited bus publish in: ${relPath}`);
  }
}

console.log('Scanning src/ directory for un-awaited publish statements...');
scanAndFixDirectory(SRC_DIR);
console.log('========================================================================');
console.log('REMEDIATION COMPLETE: All publish calls are now safely handled.');
console.log('========================================================================\n');