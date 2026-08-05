import { VertexAI } from '@google-cloud/vertexai';

/**
 * Enterprise Vertex AI Adapter for ADE Kernel
 * Connects ADE EventBus/DecisionEngine directly to Google Cloud Vertex AI & Gemini models.
 */
export class VertexAIAdapter {
  constructor(options = {}) {
    this.projectId = options.projectId || process.env.GCP_PROJECT_ID;
    this.location = options.location || process.env.GCP_LOCATION || 'us-central1';
    this.modelName = options.modelName || 'gemini-1.5-pro';
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;

    if (this.projectId) {
      this.vertexAI = new VertexAI({ project: this.projectId, location: this.location });
      this.generativeModel = this.vertexAI.getGenerativeModel({ model: this.modelName });
    }
  }

  /**
   * Binds adapter to ADE EventBus topic subscriptions
   */
  bindEventBus(eventBus) {
    this.eventBus = eventBus;
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      this.eventBus.on('vertex.inference.requested', async (payload) => {
        return await this.handleInferenceRequest(payload);
      });
    }
  }

  /**
   * Executes inference via Vertex AI Gemini and emits standard ADE response event
   */
  async handleInferenceRequest(payload = {}) {
    const { prompt, correlationId, systemInstruction } = payload;
    
    if (!this.generativeModel) {
      const err = new Error('VertexAIAdapter not configured with GCP_PROJECT_ID');
      this.logger.error('[VertexAIAdapter]', err);
      throw err;
    }

    try {
      const req = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      };

      if (systemInstruction) {
        req.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const resp = await this.generativeModel.generateContent(req);
      const contentResponse = await resp.response;
      const textResult = contentResponse.candidates[0].content.parts[0].text;

      const resultPayload = {
        correlationId,
        text: textResult,
        status: 'SUCCESS',
        timestamp: Date.now()
      };

      if (this.eventBus && typeof this.eventBus.publish === 'function') {
        await this.eventBus.publish('vertex.inference.completed', resultPayload);
      }

      return resultPayload;
    } catch (error) {
      this.logger.error('[VertexAIAdapter] Inference failed:', error);
      const errorPayload = { correlationId, error: error.message, status: 'FAILED' };
      if (this.eventBus && typeof this.eventBus.publish === 'function') {
        await this.eventBus.publish('vertex.inference.failed', errorPayload);
      }
      throw error;
    }
  }

  async boot() { this.status = 'booted'; }
  async ready() { this.status = 'ready'; }
  async shutdown() { this.status = 'shutdown'; }
  async dispose() { this.status = 'disposed'; }
}

export default VertexAIAdapter;