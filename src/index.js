import { EventBus } from './core/EventBus.js';
import { EventSchemaRegistry } from './core/EventSchemaRegistry.js';
import { MasterIntegrationRegistry } from './core/MasterIntegrationRegistry.js';
import { KernelLoader } from './core/KernelLoader.js';
import { VertexAIAdapter } from './adapters/VertexAIAdapter.js';
import { GoogleADKConnector } from './adapters/GoogleADKConnector.js';

// Initialize Core Shared Instances
export const eventBus = new EventBus();
export const schemaRegistry = new EventSchemaRegistry();
export const masterRegistry = new MasterIntegrationRegistry(eventBus, schemaRegistry);
export const kernelLoader = new KernelLoader(null, console, eventBus);

// Initialize Cloud Adapters
export const vertexAdapter = new VertexAIAdapter({ eventBus });
export const adkConnector = new GoogleADKConnector({ eventBus });

// Explicitly register subscribers across all continuum layers
masterRegistry.bindAllSubscribers();
vertexAdapter.bindEventBus(eventBus);
adkConnector.bindEventBus(eventBus);

/**
 * Enterprise Application Entry Bootstrapper
 */
export async function bootstrap() {
  await kernelLoader.boot();
  await kernelLoader.ready();
  return { eventBus, kernelLoader, masterRegistry };
}

export default bootstrap;