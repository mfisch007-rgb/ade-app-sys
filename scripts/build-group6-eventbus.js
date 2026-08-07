import fs from 'fs';
import path from 'path';

// 1. Create Universal Event Bus Core (`src/core/UniversalEventBus.js`)
const eventBusPath = path.join(process.cwd(), 'src', 'core', 'UniversalEventBus.js');
const eventBusCode = `import crypto from 'crypto';

export class UniversalEventBus {
  constructor() {
    this.name = 'UniversalEventBus';
    this.version = '1.0.0';
    this.listeners = new Map();
    this.eventLog = [];
  }

  subscribe(topic, handler) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, []);
    }
    this.listeners.get(topic).push(handler);
    console.log(\`[EventBus] Subscribed handler to topic: '\${topic}'\`);
  }

  async publish(topic, payload = {}) {
    const traceId = \`trc_\${crypto.randomBytes(4).toString('hex')}\`;
    const eventEnvelope = {
      traceId,
      topic,
      payload,
      timestamp: new Date().toISOString()
    };

    this.eventLog.push(eventEnvelope);
    console.log(\`[EventBus] Dispatched '\${topic}' [\${traceId}]\`);

    const handlers = this.listeners.get(topic) || [];
    const executions = handlers.map(handler => Promise.resolve(handler(eventEnvelope)));
    
    await Promise.all(executions);
    return eventEnvelope;
  }

  getAuditLog() {
    return this.eventLog;
  }
}
`;

fs.writeFileSync(eventBusPath, eventBusCode, 'utf8');
console.log('✅ Created src/core/UniversalEventBus.js');

// 2. Create Group 6 Verification Test (`src/cli/test-group6-eventbus.js`)
const testPath = path.join(process.cwd(), 'src', 'cli', 'test-group6-eventbus.js');
const testCode = `import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { UniversalEventBus } from '../core/UniversalEventBus.js';

async function runEventBusTest() {
  console.log('================================================================');
  console.log('   GROUP 6: UNIVERSAL EVENT BUS & AUDIT TRACE TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const eventBus = new UniversalEventBus();
  let receivedPayload = null;

  // 1. Register Subscriber
  eventBus.subscribe('signal:received', (event) => {
    receivedPayload = event;
  });

  // 2. Publish Message
  const dispatched = await eventBus.publish('signal:received', {
    asset: 'EUR/USD-OTC',
    direction: 'CALL',
    zScore: 3.12
  });

  // Verification
  const isReceived = receivedPayload && receivedPayload.traceId === dispatched.traceId;
  console.log('✅ Async Event Dispatch & Trace ID Matching:', isReceived ? 'PASS' : 'FAIL');
  console.log('   Trace ID:', dispatched.traceId);

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runEventBusTest().catch(console.error);
`;

fs.writeFileSync(testPath, testCode, 'utf8');
console.log('✅ Created src/cli/test-group6-eventbus.js');