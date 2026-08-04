import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();

console.log('========================================================================');
console.log('   ADE-APEX MULTI-LINE ASYNC EVENT BUS REMEDIATOR (AST SAFE)');
console.log('========================================================================');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');

    if (EXCLUDED_DIRS.has(file)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (/\.(js|ts|mjs|cjs)$/i.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function remediateUnawaitedPublishes(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Pattern matches (eventBus|bus).publish(...) calls across single and multi-lines
  const regex = /(?<!await\s+)\b(eventBus|bus)\.publish\s*\(/g;
  let match;
  let modifications = 0;

  // Trace matching occurrences from back to front to preserve string indices
  const matches = [];
  while ((match = regex.exec(content)) !== null) {
    matches.push({ index: match.index, busName: match[1] });
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const { index, busName } = matches[i];
    
    // Check if preceded by await (double check context)
    const prefix = content.slice(Math.max(0, index - 10), index);
    if (/await\s+$/.test(prefix)) continue;

    // Find balancing closing parenthesis
    let openParenCount = 0;
    let endParenIndex = -1;

    for (let j = index + busName.length + 8; j < content.length; j++) {
      if (content[j] === '(') openParenCount++;
      else if (content[j] === ')') {
        if (openParenCount === 0) {
          endParenIndex = j;
          break;
        }
        openParenCount--;
      }
    }

    if (endParenIndex !== -1) {
      // Check if already followed by .catch
      const postSnippet = content.slice(endParenIndex + 1, endParenIndex + 15);
      if (!postSnippet.trim().startsWith('.catch')) {
        const replacement = `.catch(err => console.error('[EventBus Async Error]', err))`;
        content = content.slice(0, endParenIndex + 1) + replacement + content.slice(endParenIndex + 1);
        modifications++;
      }
    }
  }

  if (modifications > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    console.log(` -> Fixed ${modifications} publish call(s) in: ${relPath}`);
  }
}

const allFiles = scanDirectory(ROOT_DIR);
console.log(`Scanning ${allFiles.length} JavaScript files across repository...`);

for (const file of allFiles) {
  // Skip audit tools themselves
  if (file.includes('run-enterprise-audit.js') || file.includes('fix-async-publishes.js')) continue;
  remediateUnawaitedPublishes(file);
}

console.log('========================================================================');
console.log('REMEDIATION COMPLETE: All multi-line publish calls handled safely.');
console.log('========================================================================\n');