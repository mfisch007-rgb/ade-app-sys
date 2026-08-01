// APEX AI Workforce Engine Core
const PlannerEngine = require("./PlannerEngine");
const DecisionEngine = require("./DecisionEngine");
const ExecutionEngine = require("./ExecutionEngine");
class AIWorkforce {
  constructor() { this.planner = new PlannerEngine(); this.decision = new DecisionEngine(); this.executor = new ExecutionEngine(); }
  async executeGoal(goal) { const plan = this.planner.createPlan(goal); const decision = this.decision.evaluateOption(plan); return await this.executor.runTask(decision); }
}
module.exports = AIWorkforce;
