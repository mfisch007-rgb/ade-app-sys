import ApiGateway from "./ApiGateway.js";
import LiveStreamHub from "./LiveStreamHub.js";
import GodModeEngine from "./GodModeEngine.js";
import TaskConfidenceRouter from "./TaskConfidenceRouter.js";
import TimeAwareGreeter from "./TimeAwareGreeter.js";

// Mock Event Bus for boot sequence (since we are integrating phases)
class SimpleBus {
    constructor() { this.listeners = []; }
    subscribe(topic, cb) { this.listeners.push(cb); }
    publish(topic, payload) { this.listeners.forEach(cb => cb({ topic, payload })); }
}

async function bootSequence() {
    console.log("[SYSTEM] Initiating ADE-APP-SYS Master Boot...");
    
    const greeting = TimeAwareGreeter.getGreeting("Captain King Bishop Adam", "Africa/Lagos");
    console.log(`[SYSTEM] ${greeting}`);

    const bus = new SimpleBus();
    const godMode = new GodModeEngine(bus);
    const streamHub = new LiveStreamHub(bus);
    const taskRouter = new TaskConfidenceRouter(bus, 92);

    const gateway = new ApiGateway(godMode, streamHub, 8080);
    gateway.start();
    
    console.log("[SYSTEM] All core engines online and wired. God-Mode Active.");
}

bootSequence().catch(console.error);
