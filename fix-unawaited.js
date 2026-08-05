// Save this as fix-unawaited.js and run: node fix-unawaited.js
import fs from 'fs';
import path from 'path';

function scanAndFix(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanAndFix(fullPath);
    } else if (/\.(js|mjs)$/i.test(file)) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const updated = content.replace(/(?<!await\s+)\b(eventBus|bus)\.publish\s*\(/g, 'await $1.publish(');
      if (content !== updated) {
        fs.writeFileSync(fullPath, updated, 'utf8');
        console.log(`[FIXED] Added await to publish in: ${fullPath}`);
      }
    }
  }
}

scanAndFix('./src');
console.log('Done scanning src/ for un-awaited bus publishes.');