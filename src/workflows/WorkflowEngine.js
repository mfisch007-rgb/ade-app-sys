import { BaseLifecycleModule } from '../core/BaseLifecycleModule.js';

export class WorkflowEngine extends BaseLifecycleModule {
  constructor(deps) {
    super(deps);
    this.confidenceThreshold = this.config.confidenceThreshold || 0.75;
  }

  async executeAutonomousWorkflow(workflowId, inputData) {
    this.logger.info(`[WorkflowEngine] Starting state-machine pipeline: ${workflowId}`);
    const context = { workflowId, state: 'INIT', confidence: 1.0, history: [], rollbackStack: [] };

    try {
      // 1. OBSERVE
      context.state = 'OBSERVE';
      const observed = await this._step(context, 'observationEngine', inputData);

      // 2. LEARN
      context.state = 'LEARN';
      const learned = await this._step(context, 'learningEngine', observed);

      // 3. DECIDE
      context.state = 'DECIDE';
      const decision = await this._step(context, 'decisionEngine', learned);
      context.confidence = decision.confidence || 0.5;

      // Escalation Guard
      if (context.confidence < this.confidenceThreshold) {
        this.logger.warn(`[WorkflowEngine] Low decision confidence (${context.confidence} < ${this.confidenceThreshold}). Escalating to HumanEscalation.`);
        context.state = 'HUMAN_ESCALATION';
        
        await this.eventBus.publish('human.escalation.triggered', {
          workflowId,
          reason: 'CONFIDENCE_BELOW_THRESHOLD',
          confidence: context.confidence,
          decisionPayload: decision
        });

        return { status: 'ESCALATED', context };
      }

      // 4. EXECUTE
      context.state = 'EXECUTE';
      context.rollbackStack.push(async () => this._step(context, 'executionEngine', { action: 'ROLLBACK', workflowId }));
      const executionResult = await this._step(context, 'executionEngine', decision);

      // 5. EVALUATE
      context.state = 'EVALUATE';
      const evaluation = await this._step(context, 'evaluationEngine', executionResult);

      // 6. STORE
      context.state = 'STORE';
      await this._step(context, 'storageEngine', { workflowId, evaluation, history: context.history });

      context.state = 'COMPLETED';
      await this.eventBus.publish('workflow.completed', { workflowId, status: 'SUCCESS' });
      return { status: 'SUCCESS', context };

    } catch (error) {
      this.logger.error(`[WorkflowEngine] Pipeline failed at state '${context.state}'. Initiating rollbacks...`, error);
      await this._rollback(context);
      context.state = 'FAILED';
      await this.eventBus.publish('workflow.failed', { workflowId, error: error.message, lastState: context.state });
      throw error;
    }
  }

  async _step(context, serviceKey, data) {
    const service = this[serviceKey];
    if (!service || typeof service.process !== 'function') {
      // Mock step fallback if service in active profile is passive
      this.logger.info(`[WorkflowEngine] Executing step '${context.state}' via standard context pipeline.`);
      context.history.push({ state: context.state, timestamp: Date.now() });
      return { ...data, processedBy: context.state };
    }
    const result = await service.process(data);
    context.history.push({ state: context.state, timestamp: Date.now(), result });
    return result;
  }

  async _rollback(context) {
    while (context.rollbackStack.length > 0) {
      const rollbackAction = context.rollbackStack.pop();
      try {
        await rollbackAction();
      } catch (rbErr) {
        this.logger.error(`[WorkflowEngine] Rollback action failed:`, rbErr);
      }
    }
  }
}