import KernelEventBus from "./EventBus.js";

export class ExternalStrategyBridge {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.loadedScript = null;
  }

  static getInstance() {
    if (!global.__externalStrategyBridgeInstance) {
      global.__externalStrategyBridgeInstance = new ExternalStrategyBridge();
    }
    return global.__externalStrategyBridgeInstance;
  }

  attachLocalScript(scriptPath, scriptHandler) {
    this.loadedScript = {
      path: scriptPath,
      handler: scriptHandler,
      attachedAt: new Date().toISOString()
    };
    this.eventBus.publish("EXTERNAL_SCRIPT_LOADED", { path: scriptPath });
    return { status: "ATTACHED", path: scriptPath };
  }

  runStrategy(params) {
    if (!this.loadedScript || typeof this.loadedScript.handler !== "function") {
      return { status: "STANDBY", message: "No local external script currently attached." };
    }
    return this.loadedScript.handler(params);
  }
}

export default ExternalStrategyBridge;
