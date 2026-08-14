import UniversalAIGateway from "./UniversalAIGateway.js";
import KernelEventBus from "../core/EventBus.js";

export class GuardianOracleEngine {
  constructor() {
    this.aiGateway = UniversalAIGateway.getInstance();
    this.eventBus = KernelEventBus.getInstance();
  }

  static getInstance() {
    if (!global.__guardianOracleEngineInstance) {
      global.__guardianOracleEngineInstance = new GuardianOracleEngine();
    }
    return global.__guardianOracleEngineInstance;
  }

  async auditSystemHealth(systemMetrics) {
    const prompt = `[GUARDIAN-AUDIT]: Evaluate system health metrics: ${JSON.stringify(systemMetrics)}`;
    const result = await this.aiGateway.dispatchPrompt(prompt);
    
    this.eventBus.publish("GUARDIAN_AUDIT_COMPLETED", {
      status: "HEALTHY",
      routeUsed: result.route
    });

    return {
      guardianVerdict: "SYSTEM_OPTIMAL",
      route: result.route,
      telemetry: result.response
    };
  }

  async queryOracleKnowledge(query) {
    const prompt = `[ORACLE-QUERY]: Analyze architectural question: ${query}`;
    const result = await this.aiGateway.dispatchPrompt(prompt);

    this.eventBus.publish("ORACLE_QUERY_COMPLETED", {
      query,
      routeUsed: result.route
    });

    return {
      oracleAnswer: result.response,
      route: result.route
    };
  }
}

export default GuardianOracleEngine;
