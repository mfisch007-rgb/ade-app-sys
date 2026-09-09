// LEGACY / NON-CANONICAL SURFACE — alternate bootstrap, NOT used by the canonical
// runtime (src/app.js -> src/server.js; serverless wrapper api/index.js). Do not adopt.
import { EventBus } from './core/EventBus.js';
import { EventSchemaRegistry } from './core/EventSchemaRegistry.js';
import { MasterIntegrationRegistry } from './core/MasterIntegrationRegistry.js';
import { KernelLoader } from './core/KernelLoader.js';
import { VertexAIAdapter } from './adapters/VertexAIAdapter.js';
import { GoogleADKConnector } from './adapters/GoogleADKConnector.js';

export const eventBus = new EventBus();
export const schemaRegistry = new EventSchemaRegistry();
export const masterRegistry = new MasterIntegrationRegistry(eventBus, schemaRegistry);
export const kernelLoader = new KernelLoader(null, console, eventBus);

export const vertexAdapter = new VertexAIAdapter({ eventBus });
export const adkConnector = new GoogleADKConnector({ eventBus });

masterRegistry.bindAllSubscribers();

export async function bootstrap() {
  await kernelLoader.boot();
  await kernelLoader.ready();
  return { eventBus, kernelLoader, masterRegistry };
}

export default bootstrap;