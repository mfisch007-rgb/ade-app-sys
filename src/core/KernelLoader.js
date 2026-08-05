import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Static AST import declarations for core dependencies & standing adapters
import { EventBus } from './EventBus.js';
import { EventSchemaRegistry } from './EventSchemaRegistry.js';
import { MasterIntegrationRegistry } from './MasterIntegrationRegistry.js';
import { VertexAIAdapter } from '../adapters/VertexAIAdapter.js';
import { GoogleADKConnector } from '../adapters/GoogleADKConnector.js';

/**
 * Enterprise KernelLoader Module
 * Dynamically resolves, builds, and mounts all application subsystems into the DI Container,
 * including cloud AI standing adapters (Vertex AI & Google ADK).
 */
export class KernelLoader {
  constructor(container = null, logger = console, eventBus = null) {
    this.container = container;
    this.logger = logger;
    this.status = 'uninitialized';
    this.registeredModules = new Map();

    // Initialize Event Architecture
    this.eventBus = eventBus || new EventBus();
    this.schemaRegistry = new EventSchemaRegistry();
    this.masterRegistry = new MasterIntegrationRegistry(this.eventBus, this.schemaRegistry);

    // Initialize Cloud Adapters
    this.vertexAIAdapter = new VertexAIAdapter({ eventBus: this.eventBus, logger: this.logger });
    this.googleADKConnector = new GoogleADKConnector({ eventBus: this.eventBus, logger: this.logger });

    // Bind event subscribers across all 54 layers and adapters
    if (typeof this.masterRegistry.bindAllSubscribers === 'function') {
      this.masterRegistry.bindAllSubscribers();
    }
    this.vertexAIAdapter.bindEventBus(this.eventBus);
    this.googleADKConnector.bindEventBus(this.eventBus);
  }

  /**
   * Recursively walks system directories to locate engine modules.
   */
  walkDir(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'coverage') {
          this.walkDir(fullPath, fileList);
        }
      } else if (/\.(js|mjs)$/i.test(file)) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  /**
   * Resolves and registers all subsystem modules dynamically into the container.
   */
  async initializeAllModules(rootDir = process.cwd()) {
    const searchDirs = [
      path.resolve(rootDir, 'src'),
      path.resolve(rootDir, 'kernel')
    ];
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = this.walkDir(dir);
      for (const filePath of files) {
        const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
        try {
          const fileUrl = pathToFileURL(path.resolve(filePath)).href;
          const moduleExports = await import(fileUrl);
          const ClassRef = moduleExports.default || Object.values(moduleExports)[0];

          if (typeof ClassRef === 'function') {
            const instanceName = path.basename(filePath, path.extname(filePath));
            if (this.container && typeof this.container.register === 'function') {
              this.container.register(instanceName, ClassRef);
            }
            this.registeredModules.set(relPath, ClassRef);
          }
        } catch (err) {
          if (this.logger && typeof this.logger.warn === 'function') {
            this.logger.warn(`[KernelLoader] Could not dynamic import ${relPath}: ${err.message}`);
          }
        }
      }
    }
    return this.registeredModules;
  }

  async boot() {
    await this.initializeAllModules();
    await this.vertexAIAdapter.boot();
    await this.googleADKConnector.boot();
    this.status = 'booted';
  }

  async ready() {
    await this.vertexAIAdapter.ready();
    await this.googleADKConnector.ready();
    this.status = 'ready';
  }

  async shutdown() {
    await this.vertexAIAdapter.shutdown();
    await this.googleADKConnector.shutdown();
    this.status = 'shutdown';
  }

  async dispose() {
    await this.vertexAIAdapter.dispose();
    await this.googleADKConnector.dispose();
    this.registeredModules.clear();
    this.status = 'disposed';
  }
}

export default KernelLoader;