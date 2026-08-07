import http from 'http';
import { EnterpriseMasterOrchestrator } from './core/EnterpriseMasterOrchestrator.js';

const PORT = process.env.PORT || 3000;
const orchestrator = new EnterpriseMasterOrchestrator();

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'HEALTHY', platform: 'ADE-APEX v1.0.0', uptime: process.uptime() }));
  }
  if (req.url === '/api/signal' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = await orchestrator.processIncomingWebhookSignal(payload);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Route not found' }));
});

orchestrator.bootEcosystem().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 ADE-APEX Community Edition Production Server running on port ${PORT}`);
  });
}).catch(err => console.error('[Server Boot Error]:', err));