export default class TaskConfidenceRouter {
    constructor(bus, threshold = 92) {
        this.bus = bus;
        this.threshold = threshold;
        this.pausedTasks = new Map();
    }

    evaluateTask(taskId, aiConfidenceScore, taskPayload) {
        if (aiConfidenceScore >= this.threshold) {
            if (this.bus) this.bus.publish("task.auto_executed", { taskId, score: aiConfidenceScore });
            return { status: "AUTO_EXECUTED", score: aiConfidenceScore };
        } else {
            this.pausedTasks.set(taskId, { payload: taskPayload, score: aiConfidenceScore, lastNotified: Date.now() });
            if (this.bus) this.bus.publish("task.paused_for_founder", { taskId, score: aiConfidenceScore });
            return { status: "PAUSED_AWAITING_MANUAL", score: aiConfidenceScore };
        }
    }

    triggerReminderLoop() {
        const SIX_HOURS = 6 * 60 * 60 * 1000;
        const now = Date.now();
        for (const [taskId, data] of this.pausedTasks.entries()) {
            if (now - data.lastNotified >= SIX_HOURS) {
                if (this.bus) this.bus.publish("notification.founder_reminder", { taskId, message: "Task requires Captains attention." });
                data.lastNotified = now;
            }
        }
    }
}
