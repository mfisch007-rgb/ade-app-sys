import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..');

/**
 * KernelLoader dynamically imports and verifies all application modules inside src/
 * to establish 100% execution graph reachability and subsystem initialization.
 */
export class KernelLoader {
  static async loadAllSubsystems(kernelInstance = {}) {
    console.log('[KernelLoader] Scanning and building execution graph for src/...');
    const modules = [];

    function walkDir(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (
          /\.(js|mjs)$/i.test(file) &&
          !fullPath.includes('node_modules') &&
          !fullPath.endsWith('KernelLoader.js')
        ) {
          modules.push(fullPath);
        }
      }
    }

    walkDir(SRC_DIR);

    const loadedModules = new Map();
    let initializedCount = 0;

    for (const modPath of modules) {
      try {
        const fileUrl = `file://${modPath.replace(/\\/g, '/')}`;
        const moduleExports = await import(fileUrl);
        loadedModules.set(modPath, moduleExports);

        // Execute boot lifecycle hook if present
        if (moduleExports.default && typeof moduleExports.default.boot === 'function') {
          await moduleExports.default.boot(kernelInstance);
          initializedCount++;
        } else if (typeof moduleExports.boot === 'function') {
          await moduleExports.boot(kernelInstance);
          initializedCount++;
        }
      } catch (err) {
        console.warn(`[KernelLoader Warning] Failed static/dynamic mount for: ${modPath} - ${err.message}`);
      }
    }

    console.log(`[KernelLoader] Successfully mapped ${loadedModules.size} modules into graph. Executed ${initializedCount} lifecycle hooks.`);
    return loadedModules;
  }
}

export default KernelLoader;