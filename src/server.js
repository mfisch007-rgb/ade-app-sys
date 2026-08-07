import http from 'http';
import { EnterpriseMasterOrchestrator } from './core/EnterpriseMasterOrchestrator.js';
import { CommandPaletteEngine } from './core/CommandPaletteEngine.js';

const PORT = process.env.PORT || 3000;
const orchestrator = new EnterpriseMasterOrchestrator();
const commandPalette = new CommandPaletteEngine();

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'HEALTHY', platform: 'ADE-APEX v1.0.0', uptime: process.uptime() }));
  }

  // Ctrl+K Search Route
  if (req.url.startsWith('/api/command/search') && req.method === 'GET') {
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const q = urlParams.searchParams.get('q') || '';
    const results = commandPalette.search(q);
    res.writeHead(200);
    return res.end(JSON.stringify({ query: q, count: results.length, commands: results }));
  }

  // Ctrl+K Execute Route
  if (req.url === '/api/command/execute' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { id, payload } = JSON.parse(body || '{}');
        const result = await commandPalette.executeCommand(id, payload);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Legacy Signal API
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
    console.log(`🚀 ADE-APEX Universal Operating System running on port ${PORT}`);
  });
}).catch(err => console.error('[Server Boot Error]:', err));