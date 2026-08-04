// src/server.js
import express from 'express';
import BootDAGSequence from './core/BootDAGSequence.js';
import DIContainer from './core/DIContainer.js';
import EventSchemaRegistry from './core/EventSchemaRegistry.js';
import StateMachineGuard from './core/StateMachineGuard.js';
import KernelLoader from './core/KernelLoader.js';

const app = express();
const container = new DIContainer();
const bootDAG = new BootDAGSequence();
const schemaRegistry = new EventSchemaRegistry();
const stateGuard = new StateMachineGuard();

async function startServer() {
  stateGuard.transitionTo('BOOTING');

  // Load and register all runtime modules into DI Container
  const loader = new KernelLoader(container, schemaRegistry);
  await loader.initializeAllModules();

  // Execute deterministic DAG boot order
  await bootDAG.executeBootSequence({ container, app });

  stateGuard.transitionTo('READY');

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    stateGuard.transitionTo('RUNNING');
    console.log(`[ADE-APEX] Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[ADE-APEX Boot Error]', err);
  process.exit(1);
});