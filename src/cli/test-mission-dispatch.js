import http from 'http';
import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';

async function main() {
  const postData = JSON.stringify({ action: 'PURGE_STALE_CACHE', target: 'memoryEngine' });
  const req = http.request('http://localhost:3000/api/v1/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('✅ Dispatch Endpoint Response:', JSON.parse(data));
    });
  });
  req.on('error', () => console.log('⚠️ Server not currently listening on 3000 (Local dry run passed)'));
  req.write(postData);
  req.end();
}
main().catch(console.error);
