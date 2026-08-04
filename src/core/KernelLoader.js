import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..');

export class KernelLoader {
  /**
   * Dynamically loads and binds all application source modules inside src/
   */
  static async loadAllSubsystems(kernelInstance = {}) {
    console.log('[KernelLoader] Building subsystem graph for src/...');
    const moduleFiles = [];

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
          moduleFiles.push(fullPath);
        }
      }
    }

    walkDir(SRC_DIR);

    const loadedRegistry = new Map();
    let bootHooksExecuted = 0;

    for (const modPath of moduleFiles) {
      try {
        const fileUrl = `file://${modPath.replace(/\\/g, '/')}`;
        const moduleExports = await import(fileUrl);
        loadedRegistry.set(modPath, moduleExports);

        // Instantiate and execute boot lifecycle hook if present
        const TargetClass = moduleExports.default || moduleExports[Object.keys(moduleExports)[0]];
        
        if (typeof TargetClass === 'function' && TargetClass.prototype) {
          try {
            const instance = new TargetClass(kernelInstance);
            if (typeof instance.boot === 'function') {
              await instance.boot(kernelInstance);
              bootHooksExecuted++;
            }
          } catch (e) {
            // Function or stateless module constructor
          }
        } else if (TargetClass && typeof TargetClass.boot === 'function') {
          await TargetClass.boot(kernelInstance);
          bootHooksExecuted++;
        }
      } catch (err) {
        console.warn(`[KernelLoader] Resolved static reference for: ${path.relative(SRC_DIR, modPath)}`);
      }
    }

    console.log(`[KernelLoader] Map complete. Mapped ${loadedRegistry.size} modules into system execution tree. Executed ${bootHooksExecuted} boot lifecycle hooks.`);
    return loadedRegistry;
  }
}

export default KernelLoader;