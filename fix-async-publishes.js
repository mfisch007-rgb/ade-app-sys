import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
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

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (filePath.includes('run-enterprise-audit.js') || filePath.includes('fix-async-publishes.js')) return;

  let modified = false;

  // Pattern matches (eventBus|bus).publish(...) calls not preceded by await
  const regex = /(?<!await\s+)\b(eventBus|bus)\.publish\s*\(/g;
  let match;

  const matches = [];
  while ((match = regex.exec(content)) !== null) {
    matches.push({ index: match.index, raw: match[0] });
  }

  // Iterate backwards to safely mutate indices without messing up positions
  for (let i = matches.length - 1; i >= 0; i--) {
    const { index } = matches[i];

    // Check if context is within an async function block
    const preContent = content.slice(Math.max(0, index - 500), index);
    const isInsideAsync = /\basync\b[^{]*\{[^}]*$/s.test(preContent);

    if (isInsideAsync) {
      // Direct insertion of await
      content = content.slice(0, index) + 'await ' + content.slice(index);
      modified = true;
    } else {
      // Find balancing closing parenthesis
      let openParenIndex = index + matches[i].raw.length - 1;
      let parenDepth = 1;
      let closingIndex = -1;

      for (let j = openParenIndex + 1; j < content.length; j++) {
        if (content[j] === '(') parenDepth++;
        else if (content[j] === ')') {
          parenDepth--;
          if (parenDepth === 0) {
            closingIndex = j;
            break;
          }
        }
      }

      if (closingIndex !== -1) {
        const lookAhead = content.slice(closingIndex + 1, closingIndex + 20).trim();
        if (!lookAhead.startsWith('.catch')) {
          content = content.slice(0, closingIndex + 1) + ".catch(err => console.error('[EventBus Async Error]', err))" + content.slice(closingIndex + 1);
          modified = true;
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    console.log(` -> Standardized async publish statements in: ${relPath}`);
  }
}

console.log('Scanning repository for un-awaited bus publishes...');
const files = scanDirectory(ROOT_DIR);
files.forEach(processFile);
console.log('Async standardization complete.');