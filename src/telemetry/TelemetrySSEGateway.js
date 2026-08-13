import http from "http";
import EnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";

export class TelemetrySSEGateway {
  constructor(port = 4000) {
    this.port = port;
    this.clients = new Set();
    this.server = null;
    this.kernel = EnterpriseKernelMaster.getInstance();
  }

  start() {
    // FIX: Listen to the correct event emitted by TelemetryEventHub
    this.kernel.telemetry.on("TELEMETRY_BROADCASTED", (eventData) => {
      this.broadcastEvent("telemetry_event", eventData);
    });

    this.kernel.aiGateway.on("AI_CACHE_HIT", (data) => {
      this.broadcastEvent("ai_cache_hit", data);
    });

    this.kernel.aiGateway.on("AI_REQUEST_SUCCESS", (data) => {
      this.broadcastEvent("ai_request_success", data);
    });

    this.server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === "/events" || req.url === "/api/telemetry/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });

        const handshake = {
          status: "CONNECTED",
          kernelState: "OPERATIONAL",
          timestamp: new Date().toISOString(),
          metrics: this.kernel.aiGateway.getMetrics()
        };
        res.write(`event: handshake\ndata: ${JSON.stringify(handshake)}\n\n`);

        this.clients.add(res);

        req.on("close", () => {
          this.clients.delete(res);
        });
      } else if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "HEALTHY", activeClients: this.clients.size }));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`[SSE TELEMETRY GATEWAY] Active on http://localhost:${this.port}/api/telemetry/stream`);
        resolve(true);
      });
    });
  }

  broadcastEvent(eventType, payload) {
    const formattedData = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      client.write(formattedData);
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      for (const client of this.clients) {
        client.end();
      }
      this.clients.clear();
    }
  }
}

export default TelemetrySSEGateway;
