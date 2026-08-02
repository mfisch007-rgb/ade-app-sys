export default class ADEPluginSDK {
    constructor(name, version = "1.0.0") {
        this.name = name;
        this.version = version;
        this.runtime = null;
    }

    attachRuntime(runtime) {
        this.runtime = runtime;
    }

    onObserve(source, payload, metadata) {
        if (this.runtime && this.runtime.engines.observation) {
            return this.runtime.engines.observation.observe(source, payload, metadata);
        }
        throw new Error("RUNTIME_OBSERVATION_NOT_AVAILABLE");
    }

    onExecute(taskPayload, tenantContext) {
        if (this.runtime && this.runtime.engines.execution) {
            return this.runtime.engines.execution.executeTask(taskPayload, tenantContext);
        }
        throw new Error("RUNTIME_EXECUTION_NOT_AVAILABLE");
    }
}
