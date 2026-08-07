import http from 'http';
import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { WebhookServer } from '../server/WebhookServer.js';

async function main() {
  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();
  const server = new WebhookServer(kernel, 3099);
  await server.start();

  const postData = JSON.stringify({ event: 'LEAD_SIGNUP', leadId: 'LEAD-9921', asset: 'BTC/USD' });
  const req = http.request('http://localhost:3099/api/v1/webhook/custom-client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  }, (res) => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', async () => {
      console.log('✅ Server Ingestion Response:', JSON.parse(responseData));
      await server.stop();
      await kernel.shutdown();
    });
  });
  req.write(postData);
  req.end();
}
main().catch(console.error);
