export default class AutonomousExecutionEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.executions = [];
    }

    async executeTask(taskId, actionFn) {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const startTime = Date.now();
        
        let result = null;
        let status = "SUCCESS";

        try {
            result = await actionFn();
        } catch (error) {
            status = "FAILED";
            result = { error: error.message };
        }

        const payload = {
            executionId,
            taskId,
            status,
            result,
            durationMs: Date.now() - startTime
        };

        this.executions.push(payload);

        if (this.bus) {
            await this.bus.publish("execution.completed", payload).catch(err => console.error('[EventBus Async Error]', err));
        }

        return payload;
    }
}