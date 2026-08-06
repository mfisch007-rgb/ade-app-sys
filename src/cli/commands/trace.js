import { EnterpriseEventBus } from '../../kernel/EnterpriseEventBus.js';

export async function runAdeTrace() {
  console.log('================================================================================');
  console.log('   ADE-APEX DISTRIBUTED TRACE INSPECTOR (ade trace)');
  console.log('================================================================================');
  const bus = new EnterpriseEventBus();
  bus.subscribe('order.created', async (env) => {
    console.log(`[Trace Log] TraceID: ${env.meta.traceId} | SpanID: ${env.meta.spanId} | Topic: ${env.topic}`);
  });
  await bus.publish('order.created', { orderId: 'ORD-1002' });
}