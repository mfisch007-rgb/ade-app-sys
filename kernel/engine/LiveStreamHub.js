export default class LiveStreamHub {
    constructor(bus) {
        this.bus = bus;
        this.clients = new Set();
        if (this.bus) {
            this.bus.subscribe("*", (event) => this.broadcast(event));
        }
    }

    addClient(req, res) {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        });
        res.write(`data: {"message": "Connected to ADE God-Mode Telemetry"}\n\n`);
        this.clients.add(res);
        req.on("close", () => this.clients.delete(res));
    }

    broadcast(data) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        for (const client of this.clients) {
            client.write(payload);
        }
    }
}
