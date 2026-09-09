export class CanonicalWorkflowAdapter {
  constructor(kernel) {
    this.kernel = kernel;
  }

  resolve(name) {
    try { if (typeof this.kernel?.resolve === "function") return this.kernel.resolve(name); } catch (_) {}
    try { if (typeof this.kernel?.container?.resolve === "function") return this.kernel.container.resolve(name); } catch (_) {}
    try { if (typeof this.kernel?.container?.get === "function") return this.kernel.container.get(name); } catch (_) {}
    return null;
  }

  getCanonicalWorkflow() {
    const workflow = this.resolve("workflowEngine");
    if (!workflow) throw new Error("CANONICAL_WORKFLOW_ENGINE_NOT_FOUND");
    return workflow;
  }

  async execute(workflowId, payload) {
    const workflow = this.getCanonicalWorkflow();
    if (typeof workflow.executeAutonomousWorkflow === "function") {
      return workflow.executeAutonomousWorkflow(workflowId, payload);
    }
    if (typeof workflow.process === "function") {
      return workflow.process({ workflowId, payload });
    }
    throw new Error("CANONICAL_WORKFLOW_ENGINE_HAS_NO_SUPPORTED_EXECUTION_METHOD");
  }
}

export default CanonicalWorkflowAdapter;
