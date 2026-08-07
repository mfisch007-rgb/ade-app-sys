import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { APIGatewayServer } from '../gateway/api-server.js';
import http from 'http';

async function runE2ETest() {
  console.log('================================================================');
  console.log('   PHASE 1 & PHASE 2 E2E VERIFICATION TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  // Mock Guardian System authorization check for testing
  const guardian = kernel.subsystems?.get('guardian');
  if (guardian) {
    guardian.authorizeAction = async ({ role, action }) => {
      if (role === 'GUEST' && action && action.startsWith('ADMIN_')) return false;
      return true;
    };
  }

  const gateway = new APIGatewayServer(kernel);
  await gateway.start(3005);

  // 1. Test Authorized Dispatch (Role: ADMIN)
  const req1 = http.request('http://localhost:3005/api/v1/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Role-Claim': 'ADMIN'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      const parsed = JSON.parse(data);
      console.log('✅ Admin Dispatch Status:', parsed.status === 'ACCEPTED' ? 'PASS' : 'FAIL');

      // 2. Test Forbidden Dispatch (Role: GUEST attempting ADMIN action)
      const req2 = http.request('http://localhost:3005/api/v1/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Role-Claim': 'GUEST'
        }
      }, (res2) => {
        let data2 = '';
        res2.on('data', chunk => data2 += chunk);
        res2.on('end', async () => {
          console.log('✅ RBAC Gatekeeper Block Status:', res2.statusCode === 403 ? 'PASS' : 'FAIL');
          await gateway.stop();
          await kernel.shutdown();
          console.log('================================================================');
          process.exit(0);
        });
      });

      req2.write(JSON.stringify({ action: 'ADMIN_PURGE_SYSTEM' }));
      req2.end();
    });
  });

  req1.write(JSON.stringify({ action: 'EXECUTE_SYS_DIAGNOSTICS' }));
  req1.end();
}

runE2ETest().catch(console.error);
