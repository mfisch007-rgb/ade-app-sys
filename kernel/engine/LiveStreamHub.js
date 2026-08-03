export default class LiveStreamHub {
    constructor(eventBus) {
        this.clients = [];
        this.bus = eventBus;
        
        // Subscribe to all event bus topics and push to web clients
        this.bus.subscribe("*", (event) => {
            this.broadcast(event);
        });
    }

    addClient(res) {
        this.clients.push(res);
        res.on("close", () => {
            this.clients = this.clients.filter(c => c !== res);
        });
    }

    broadcast(data) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        this.clients.forEach(client => client.write(payload));
    }
}
