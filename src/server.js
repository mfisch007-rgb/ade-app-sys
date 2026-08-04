import http from 'http';
import KernelLoader from './core/KernelLoader.js';

const PORT = process.env.PORT || 3000;

async function bootstrapEcosystem() {
  console.log('================================================================');
  console.log('        ADE-APEX ENTERPRISE AIBOS KERNEL INITIALIZATION          ');
  console.log('================================================================');

  // 1. Mount Dynamic Reachability & Execution Tree
  const registeredModules = await KernelLoader.loadAllSubsystems({ bootTime: Date.now() });

  // 2. Initialize Core HTTP Server & Health Interface
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ONLINE',
        system: 'ADE-APEX AIBOS',
        subsystemsActive: registeredModules.size,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ADE-APEX AI Autonomous Operating System Kernel Live.\n');
  });

  server.listen(PORT, () => {
    console.log(`[ADE-APEX Server] Listening on port ${PORT}`);
    console.log(`[ADE-APEX Server] Health endpoint accessible at http://localhost:${PORT}/health`);
  });
}

bootstrapEcosystem().catch((err) => {
  console.error('[ADE-APEX Critical Boot Failure]', err);
  process.exit(1);
});