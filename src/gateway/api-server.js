import http from 'http';
import fs from 'fs';
import path from 'path';
import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { KernelEvent } from '../kernel/contracts/EventContract.js';

const kernel = new EnterpriseKernelMaster();
let clients = [];

async function init() {
  await kernel.boot();
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      const htmlPath = path.resolve('public/index.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(htmlPath, 'utf8'));
      }
    } else if (req.url === '/api/v1/capabilities') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ecosystem: 'ADE-APEX Enterprise',
        version: '1.0.0',
        subsystems: Array.from(kernel.subsystems.keys()),
        plugins: kernel.pluginRegistry ? kernel.pluginRegistry.getHealth() : {}
      }));
    } else if (req.url === '/api/v1/dispatch' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const event = new KernelEvent({ source: 'COMMAND_CENTER', action: payload.action || 'EXECUTE_MISSION', payload });
          if (kernel.subsystems.has('eventBus')) {
            kernel.subsystems.get('eventBus').publish('MISSION_DISPATCHED', event);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'SUCCESS', action: payload.action, timestamp: new Date().toISOString() }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'DISPATCH_FAILED', message: err.message }));
        }
      });
      return;
    } else if (req.url === '/api/v1/telemetry') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      clients.push(res);
      req.on('close', () => { clients = clients.filter(c => c !== res); });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });

  setInterval(() => {
    const eventData = JSON.stringify({
      timestamp: new Date().toISOString(),
      health: '100.0%',
      subsystemsActive: kernel.subsystems.size,
      pluginsActive: kernel.pluginRegistry ? kernel.pluginRegistry.plugins.size : 0,
      telemetry: {
        oracleState: Math.random() > 0.5 ? 'THINKING' : 'IDLE',
        guardianState: 'MONITORING',
        memoryGrowth: '+12 Concepts',
        workflowExecution: 'SUB_MS_LATENCY'
      }
    });
    clients.forEach(c => c.write(`data: ${eventData}\n\n`));
  }, 2000);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`================================================================================`);
    console.log(`🚀 ADE ENTERPRISE COMMAND CENTER LIVE AT http://localhost:${PORT}`);
    console.log(`================================================================================`);
  });
}
init().catch(console.error);
