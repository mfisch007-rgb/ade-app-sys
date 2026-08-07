import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
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
