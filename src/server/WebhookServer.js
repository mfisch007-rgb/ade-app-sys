import http from 'http';

export class WebhookServer {
  constructor(kernel, port = 3001) {
    this.kernel = kernel;
    this.port = port;
    this.server = null;
  }

  start() {
    this.server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url.startsWith('/api/v1/webhook/')) {
        const source = req.url.split('/')[4] || 'GENERIC_SOURCE';
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const router = this.kernel.pluginRegistry?.plugins?.get('UniversalWebhookRouter');
            if (router && typeof router.ingest === 'function') {
              router.ingest(source, data.event || 'INCOMING_SIGNAL', data);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ACCEPTED', source, timestamp: new Date().toISOString() }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'INVALID_JSON', message: err.message }));
          }
        });
      } else if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UP', plugins: this.kernel.pluginRegistry?.getHealth() }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'NOT_FOUND' }));
      }
    });
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`[WebhookServer] Ingestion HTTP server listening on port ${this.port}`);
        resolve(this.server);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[WebhookServer] HTTP server stopped cleanly.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
