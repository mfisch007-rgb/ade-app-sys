/**
 * ADE-APEX REAL-TIME EVENT BUS GATEWAY & WS SERVER
 * Enterprise Event-Driven Architecture
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';

const PORT = process.env.PORT || 3000;
const PIN_VAULT = '882041'; // 6-Digit Security PIN Gate
const kernel = new EnterpriseKernelMaster();

async function startServer() {
  await kernel.boot();

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ADE-PIN');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, \`http://${req.headers.host}\`);

    // Serve Public Command Center UI
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const htmlPath = path.join(process.cwd(), 'public', 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(htmlPath));
        return;
      }
    }

    // Asset Router for Branding Assets & Dynamic Images
    if (url.pathname.startsWith('/assets/')) {
      const fileName = path.basename(url.pathname);
      const assetDir = path.join(process.cwd(), 'ADE-LOGO_files');
      const filePath = path.join(assetDir, fileName);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.jpeg': 'image/jpeg',
          '.jpg': 'image/jpeg',
          '.png': 'image/png',
          '.svg': 'image/svg+xml'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(fs.readFileSync(filePath));
        return;
      }
    }

    // 6-Digit PIN Authorization Endpoint
    if (url.pathname === '/api/v1/auth/pin' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { pin } = JSON.parse(body);
          if (pin === PIN_VAULT) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, token: 'ADE-FOUNDER-SESSION-GRANTED', role: 'FOUNDER' }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_6_DIGIT_AUTHORIZATION_PIN' }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_REQUEST' }));
        }
      });
      return;
    }

    // System Diagnostics REST API
    if (url.pathname === '/api/v1/telemetry') {
      const subsystemsState = {};
      for (const [name, state] of kernel.subsystems.entries()) {
        subsystemsState[name] = state;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'OPERATIONAL',
        version: 'v1.0.0',
        commit: 'b40c777',
        subsystems: subsystemsState,
        registeredModules: [
          { id: 'mod-oracle', name: 'ADE-Oracle Intelligence Platform', category: 'Intelligence', icon: '🧠', route: '/oracle' },
          { id: 'mod-procarta', name: 'ADE-Procarta Workflow Engine', category: 'Automation', icon: '⚙️', route: '/procarta' },
          { id: 'mod-awbuli', name: 'ADE-AWBULI Messaging Conduit', category: 'Communications', icon: '💬', route: '/awbuli' },
          { id: 'mod-ledgerflow', name: 'ADE-LedgerFlow Bookkeeping AaaS', category: 'Finance', icon: '📊', route: '/ledgerflow' },
          { id: 'mod-guardian', name: 'ADE-Guardian Security Vault', category: 'Governance', icon: '🛡️', route: '/guardian' }
        ]
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  });

  // Real-Time Event Bus WebSocket Server
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
      type: 'KERNEL_CONNECTED',
      timestamp: new Date().toISOString(),
      message: 'Subscribed to Enterprise Event Bus Stream'
    }));

    // Stream periodic live events simulating active AI Workers & Bus activity
    const interval = setInterval(() => {
      const workers = ['Guardian', 'Oracle', 'Ledger', 'Knowledge', 'WorkflowEngine'];
      const randomWorker = workers[Math.floor(Math.random() * workers.length)];
      const confidence = (94 + Math.random() * 5.9).toFixed(1);
      ws.send(JSON.stringify({
        type: 'BUS_EVENT',
        worker: randomWorker,
        confidence: confidence,
        event: \`Executed lifecycle trace for subsystem \${randomWorker}\`,
        timestamp: new Date().toLocaleTimeString()
      }));
    }, 2500);

    ws.on('close', () => clearInterval(interval));
  });

  server.listen(PORT, () => {
    console.log('================================================================================');
    console.log(\`  ADE-APEX EVENT GATEWAY LIVE ON PORT :${PORT}\`);
    console.log(\`  Command Center: http://localhost:${PORT}/\`);
    console.log('================================================================================');
  });
}

startServer().catch(err => {
  console.error('[Gateway] Critical Boot Failure:', err);
  process.exit(1);
});
