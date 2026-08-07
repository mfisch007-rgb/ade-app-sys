import { EventEmitter } from 'events';

export class WorkflowDAGEngine extends EventEmitter {
  constructor(kernel) {
    super();
    this.kernel = kernel;
    this.workflows = new Map();
  }

  registerDAG(workflowId, nodes) {
    // nodes: Array of { id, action, dependsOn: [], handler: async (context) => result }
    this.workflows.set(workflowId, nodes);
    console.log(`[DAGEngine] Registered workflow '${workflowId}' with ${nodes.length} nodes.`);
  }

  async executeDAG(workflowId, initialContext = {}) {
    const nodes = this.workflows.get(workflowId);
    if (!nodes) {
      throw new Error(`Workflow '${workflowId}' not found.`);
    }

    const context = { ...initialContext };
    const completed = new Set();
    const results = {};
    const pending = new Map(nodes.map(n => [n.id, n]));

    console.log(`[DAGEngine] Executing DAG workflow '${workflowId}'...`);

    while (pending.size > 0) {
      const executable = [];

      for (const [id, node] of pending.entries()) {
        const dependenciesMet = (node.dependsOn || []).every(dep => completed.has(dep));
        if (dependenciesMet) {
          executable.push(node);
        }
      }

      if (executable.length === 0) {
        throw new Error(`Circular dependency or unmet prerequisite detected in workflow '${workflowId}'.`);
      }

      // Execute all ready nodes in parallel
      await Promise.all(executable.map(async (node) => {
        try {
          console.log(`[DAGEngine] Running Node: '${node.id}'...`);
          const res = await node.handler(context, results);
          results[node.id] = res;
          completed.add(node.id);
          pending.delete(node.id);
        } catch (err) {
          console.error(`[DAGEngine] Node '${node.id}' failed:`, err.message);
          throw err;
        }
      }));
    }

    console.log(`[DAGEngine] Workflow '${workflowId}' executed successfully.`);
    return { status: 'COMPLETED', results };
  }
}
