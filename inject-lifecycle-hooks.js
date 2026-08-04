import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const TARGET_DIRS = ['kernel/engine', 'src/modules', 'kernel/channel'];

function scanAndInject(dir) {
  const fullPath = path.join(ROOT_DIR, dir);
  if (!fs.existsSync(fullPath)) return;

  const files = fs.readdirSync(fullPath);
  for (const file of files) {
    if (!/\.js$/i.test(file)) continue;
    const filePath = path.join(fullPath, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if lifecycle hooks already exist
    if (content.includes('async boot()') || content.includes('boot(')) continue;

    const classMatch = content.match(/class\s+(\w+)/);
    if (classMatch) {
      const className = classMatch[1];
      const lifecycleMethods = `
  async boot() {
    this.status = 'booting';
    if (typeof this.init === 'function') await this.init();
    this.status = 'booted';
  }

  async ready() {
    this.status = 'ready';
  }

  async shutdown() {
    this.status = 'shutting_down';
  }

  async dispose() {
    this.status = 'disposed';
  }
`;
      // Inject before the last closing brace of the class
      const lastBraceIndex = content.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        content = content.slice(0, lastBraceIndex) + lifecycleMethods + content.slice(lastBraceIndex);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(` -> Injected lifecycle hooks into: ${dir}/${file}`);
      }
    }
  }
}

console.log('Injecting lifecycle & governance hooks across application engines...');
TARGET_DIRS.forEach(scanAndInject);
console.log('Lifecycle injection complete.');