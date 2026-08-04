import http from 'http';
import KernelLoader from './core/KernelLoader.js';

const PORT = process.env.PORT || 3000;

async function bootstrapServer() {
  console.log('================================================================');
  console.log('           ADE-APEX ENTERPRISE KERNEL BOOTSTRAPPER               ');
  console.log('================================================================');

  // 1. Mount Subsystem Reachability Graph & Register Contracts
  const loadedMap = await KernelLoader.loadAllSubsystems({ bootTime: Date.now() });

  // 2. Initialize HTTP Interface & Health Endpoints
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ONLINE',
        system: 'ADE-APEX AIBOS',
        modulesLoaded: loadedMap.size,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ADE-APEX AI Operating System Kernel active.\n');
  });

  server.listen(PORT, () => {
    console.log(`[ADE-APEX Server] Listening on port ${PORT}`);
    console.log(`[ADE-APEX Server] Health endpoint live at http://localhost:${PORT}/health`);
  });
}

bootstrapServer().catch((err) => {
  console.error('[ADE-APEX Fatal Boot Failure]', err);
  process.exit(1);
});