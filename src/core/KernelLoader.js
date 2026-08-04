import fs from "fs";
import path from "path";

export class KernelLoader {
  constructor(container, logger = console) {
    this.container = container;
    this.logger = logger;
    this.registeredModules = new Map();
  }

  /**
   * Standardized directory walk and module registration logic
   */
  walkDir(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        this.walkDir(fullPath, fileList);
      } else if (/\.(js|mjs)$/i.test(file)) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  /**
   * Resolves and registers all subsystem modules dynamically into DI Container
   */
  async resolveAndRegisterAll(rootDir = process.cwd()) {
    const searchDirs = [
      path.join(rootDir, "src"),
      path.join(rootDir, "kernel")
    ];

    for (const dir of searchDirs) {
      const files = this.walkDir(dir);
      for (const filePath of files) {
        const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
        try {
          const resolved = path.resolve(filePath);
          const moduleExports = await import(`file://${resolved}`);
          const ClassRef = moduleExports.default || Object.values(moduleExports)[0];
          
          if (typeof ClassRef === "function") {
            const instanceName = path.basename(filePath, path.extname(filePath));
            if (this.container && typeof this.container.register === "function") {
              this.container.register(instanceName, ClassRef);
            }
            this.registeredModules.set(relPath, ClassRef);
          }
        } catch (err) {
          this.logger.warn(`[KernelLoader] Unable to resolve module ${relPath}: ${err.message}`);
        }
      }
    }
    return this.registeredModules;
  }

  async boot() {
    this.logger.log("[KernelLoader] Initializing system boot phase...");
  }

  async ready() {
    this.logger.log("[KernelLoader] Kernel modules fully resolved and ready.");
  }

  async shutdown() {
    this.logger.log("[KernelLoader] Shutting down kernel loader context...");
  }

  async dispose() {
    this.registeredModules.clear();
  }
}