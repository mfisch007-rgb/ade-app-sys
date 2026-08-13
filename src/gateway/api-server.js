import http from 'http';
import { parse } from 'url';

export class APIGatewayServer {
  constructor(kernelMaster) {
    this.kernel = kernelMaster;
    this.server = null;
    this.clients = new Set();
  }

  start(port = 3000) {
    return new Promise((resolve) => {
      // Phase 1: Dynamic Telemetry Observer - Attach EventBus Listener
      if (this.kernel.eventBus) {
        this.kernel.eventBus.subscribe('*', (event) => {
          this.broadcastTelemetry({
            type: 'EVENT_BUS_BROADCAST',
            event,
            timestamp: Date.now()
          });
        });
      }

      this.server = http.createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        const method = req.method.toUpperCase();

        // CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Role-Claim');

        if (method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
        }

        // Phase 1: Live SSE Telemetry Stream
        if (method === 'GET' && parsedUrl.pathname === '/api/v1/telemetry') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          res.write(`data: ${JSON.stringify({ status: 'CONNECTED', telemetry: this.getTelemetryData() })}\n\n`);
          
          this.clients.add(res);
          req.on('close', () => this.clients.delete(res));
          return;
        }

        // Capabilities Discovery Route
        if (method === 'GET' && parsedUrl.pathname === '/api/v1/capabilities') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'SUCCESS',
            plugins: this.kernel.plugins || {},
            subsystems: Array.from(this.kernel.subsystems?.keys() || [])
          }));
        }

        // Phase 2: RBAC Interceptor for Mission Command Dispatch
        if (method === 'POST' && parsedUrl.pathname === '/api/v1/dispatch') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const userRole = req.headers['x-role-claim'] || 'GUEST';
              const authHeader = req.headers['authorization'] || '';

              // Phase 2 Guard: Check permissions via Guardian Subsystem
              const guardian = this.kernel.guardian;
              if (guardian && typeof guardian.authorizeAction === 'function') {
                const isAuthorized = await guardian.authorizeAction({
                  role: userRole,
                  token: authHeader,
                  action: payload.action
                });

                if (!isAuthorized) {
                  res.writeHead(403, { 'Content-Type': 'application/json' });
                  return res.end(JSON.stringify({
                    error: 'FORBIDDEN',
                    message: `Role '${userRole}' is not authorized to execute action '${payload.action}'`
                  }));
                }
              }

              // Dispatch event to Kernel EventBus
              if (this.kernel.eventBus) {
                this.kernel.eventBus.publish('gateway.dispatch', {
                  action: payload.action,
                  params: payload.params || {},
                  dispatchedBy: userRole,
                  timestamp: Date.now()
                }).catch(err => console.error('[EventBus Async Error]', err));
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'ACCEPTED',
                action: payload.action,
                role: userRole,
                timestamp: Date.now()
              }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'BAD_REQUEST', message: err.message }));
            }
          });
          return;
        }

        // Fallback 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'NOT_FOUND' }));
      });

      this.server.listen(port, () => {
        console.log(`[APIGatewayServer] Listening on port ${port}`);
        resolve(true);
      });
    });
  }

  getTelemetryData() {
    return {
      oracleState: 'ACTIVE',
      memoryGrowth: '+12KB',
      activeClients: this.clients.size,
      timestamp: Date.now()
    };
  }

  broadcastTelemetry(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[APIGatewayServer] Gateway stopped.');
          resolve(true);
        });
      } else {
        resolve(true);
      }
    });
  }
}
