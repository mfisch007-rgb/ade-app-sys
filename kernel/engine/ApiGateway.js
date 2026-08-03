import http from "http";

export default class ApiGateway {
    constructor(godModeEngine, liveStreamHub, port = 8080) {
        this.godModeEngine = godModeEngine;
        this.liveStreamHub = liveStreamHub;
        this.port = port;
    }

    start() {
        const server = http.createServer((req, res) => {
            // Enable CORS for browser requests
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Security-PIN");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

            if (req.method === "OPTIONS") {
                res.writeHead(204);
                return res.end();
            }

            // SSE Telemetry Stream Endpoint
            if (req.method === "GET" && req.url === "/api/stream") {
                res.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                });
                res.write(`data: ${JSON.stringify({ topic: "SYSTEM", payload: { message: "Connected to ADE God-Mode Telemetry" } })}\n\n`);
                this.liveStreamHub.addClient(res);
                return;
            }

            // God-Mode Command Endpoint with Security PIN Verification Guard
            if (req.method === "POST" && req.url === "/api/godmode/command") {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", () => {
                    try {
                        const payload = JSON.parse(body);
                        const authHeader = req.headers["authorization"];
                        const pinHeader = req.headers["x-security-pin"];
                        
                        // Enforce Authorization & X-Security-PIN Check
                        if (authHeader !== "Bearer ADE_SUPREME_FOUNDER_KEY_2026" || !pinHeader) {
                            res.writeHead(401, { "Content-Type": "application/json" });
                            return res.end(JSON.stringify({ error: "UNAUTHORIZED_FOUNDER_KEY_OR_MISSING_PIN" }));
                        }

                        if (payload.action === "TOGGLE_FEATURE") {
                            this.godModeEngine.toggleFeature(payload.feature, payload.state);
                            res.writeHead(200, { "Content-Type": "application/json" });
                            return res.end(JSON.stringify({ status: "SUCCESS", feature: payload.feature, state: payload.state }));
                        }

                        res.writeHead(400, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "UNKNOWN_COMMAND" }));
                    } catch (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
                return;
            }

            res.writeHead(404);
            res.end("Not Found");
        });

        server.listen(this.port, () => {
            console.log(`[API GATEWAY] Listening on port ${this.port}`);
        });
    }
}