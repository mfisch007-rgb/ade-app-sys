import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

export class KernelLoader {
  constructor() {
    this.registry = new Map();
    this.failedModules = [];
  }

  async bootstrap() {
    console.log('[ADE KERNEL] Initializing Universal Module Auto-Wire...');
    const allFiles = this.getAllFiles(srcDir);
    
    for (const filePath of allFiles) {
      if (filePath.endsWith('server.js') || filePath.endsWith('KernelLoader.js') || filePath.includes('cli/')) continue;
      
      try {
        const fileUrl = pathToFileURL(filePath).href;
        const mod = await import(fileUrl);
        const relativeKey = path.relative(srcDir, filePath).replace(/\\/g, '/');
        this.registry.set(relativeKey, mod);
      } catch (err) {
        this.failedModules.push({ file: filePath, error: err.message });
      }
    }

    console.log(`[ADE KERNEL] Auto-Wire Complete: ${this.registry.size} modules wired into runtime. (${this.failedModules.length} dynamic load deferrals)`);
    return {
      wiredCount: this.registry.size,
      deferredCount: this.failedModules.length,
      modules: Array.from(this.registry.keys())
    };
  }

  getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git') continue;
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        this.getAllFiles(filePath, fileList);
      } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
        fileList.push(filePath);
      }
    }
    return fileList;
  }
}

export const kernelLoader = new KernelLoader();
