const http = require("http");

export default class ApiGateway {
    constructor(godModeEngine, streamHub, port = 8080) {
        this.godMode = godModeEngine;
        this.streamHub = streamHub;
        this.port = port;
    }

    start() {
        const server = http.createServer((req, res) => {
            // Enable CORS for your UI dashboard
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

            if (req.method === "OPTIONS") {
                res.writeHead(204);
                return res.end();
            }

            // Route: Live Events Stream
            if (req.url === "/api/stream" && req.method === "GET") {
                return this.streamHub.addClient(req, res);
            }

            // Route: Health Check
            if (req.url === "/api/health" && req.method === "GET") {
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ status: "ADE_APEX_ONLINE", version: "1.0.0" }));
            }

            // Route: God-Mode Command Execution
            if (req.url === "/api/godmode/command" && req.method === "POST") {
                let body = "";
                req.on("data", chunk => body += chunk.toString());
                req.on("end", () => {
                    try {
                        const data = JSON.parse(body);
                        const auth = this.godMode.authenticateFounder(req.headers.authorization);
                        if (data.action === "TOGGLE_FEATURE") {
                            const result = this.godMode.toggleGlobalFeature(data.feature, data.state);
                            res.writeHead(200, { "Content-Type": "application/json" });
                            return res.end(JSON.stringify({ success: true, feature: data.feature, state: result }));
                        }
                        throw new Error("UNKNOWN_COMMAND");
                    } catch (err) {
                        res.writeHead(403, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: err.message }));
                    }
                });
                return;
            }

            res.writeHead(404);
            res.end(JSON.stringify({ error: "ROUTE_NOT_FOUND" }));
        });

        server.listen(this.port, () => {
            console.log(`[API GATEWAY] Listening on port ${this.port}`);
        });
    }
}
