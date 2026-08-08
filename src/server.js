import http from 'http';
import fs from 'fs';
import path from 'path';
import { EnterpriseMasterOrchestrator } from './core/EnterpriseMasterOrchestrator.js';
import { CommandPaletteEngine } from './core/CommandPaletteEngine.js';

const PORT = process.env.PORT || 3000;
const orchestrator = new EnterpriseMasterOrchestrator();
const commandPalette = new CommandPaletteEngine();

const server = http.createServer(async (req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    const htmlPath = path.join(process.cwd(), 'public', 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(htmlPath, 'utf8'));
    }
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'HEALTHY', platform: 'ADE-APEX v1.0.0', uptime: process.uptime() }));
  }

  if (req.url.startsWith('/api/command/search') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const q = urlParams.searchParams.get('q') || '';
    return res.end(JSON.stringify({ query: q, count: commandPalette.search(q).length, commands: commandPalette.search(q) }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Route not found' }));
});

orchestrator.bootEcosystem().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 ADE-APEX Universal Operating System running on port ${PORT}`);
  });
}).catch(err => console.error('[Server Boot Error]:', err));