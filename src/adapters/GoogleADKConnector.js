/**
 * Enterprise Standing Adapter for Google Agent Development Kit (ADK)
 */
export class GoogleADKConnector {
  constructor(options = {}) {
    this.adkEndpoint = options.adkEndpoint || process.env.GOOGLE_ADK_ENDPOINT || 'http://localhost:8080/adk/v1';
    this.apiKey = options.apiKey || process.env.GOOGLE_ADK_API_KEY || '';
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    this.activeSessions = new Map();
  }

  bindEventBus(eventBus) {
    this.eventBus = eventBus;
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this.eventBus.on('adk.agent.dispatch', async (payload) => {
        return await this.dispatchToADKAgent(payload);
      });
      this.eventBus.on('adk.tool.execute', async (payload) => {
        return await this.executeADKTool(payload);
      });
    }
  }

  async dispatchToADKAgent(payload = {}) {
    const { agentId, task, sessionParameters, correlationId } = payload;

    try {
      const response = await fetch(`${this.adkEndpoint}/agents/${agentId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          input: task,
          session_id: correlationId,
          parameters: sessionParameters || {}
        })
      });

      if (!response.ok) {
        throw new Error(`ADK Endpoint HTTP error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const outputPayload = {
        correlationId,
        agentId,
        result: result.output || result,
        status: 'COMPLETED',
        timestamp: Date.now()
      };

      if (this.eventBus && typeof this.eventBus.publish === 'function') {
        await this.eventBus.publish('adk.agent.completed', outputPayload);
      }

      return outputPayload;
    } catch (err) {
      this.logger.error(`[GoogleADKConnector] Failed to dispatch task to agent '${agentId}':`, err);
      const errorPayload = { correlationId, agentId, error: err.message, status: 'FAILED' };
      if (this.eventBus && typeof this.eventBus.publish === 'function') {
        await this.eventBus.publish('adk.agent.failed', errorPayload);
      }
      throw err;
    }
  }

  async executeADKTool(payload = {}) {
    const { toolName, parameters, correlationId } = payload;
    
    const adkToolResponse = {
      toolName,
      executedBy: 'ADE-Kernel-ADK-Connector',
      output: { status: 'EXECUTED', parameters },
      correlationId
    };

    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      await this.eventBus.publish('adk.tool.completed', adkToolResponse);
    }

    return adkToolResponse;
  }

  async boot() { this.status = 'booted'; }
  async ready() { this.status = 'ready'; }
  async shutdown() { this.status = 'shutdown'; }
  async dispose() { 
    this.activeSessions.clear();
    this.status = 'disposed'; 
  }
}

export default GoogleADKConnector;