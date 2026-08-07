import fs from 'fs';
import path from 'path';

// 1. Create Workflow DAG Engine Extension (`src/core/WorkflowDAGEngine.js`)
const dagEnginePath = path.join(process.cwd(), 'src', 'core', 'WorkflowDAGEngine.js');
const dagEngineCode = `import { EventEmitter } from 'events';

export class WorkflowDAGEngine extends EventEmitter {
  constructor(kernel) {
    super();
    this.kernel = kernel;
    this.workflows = new Map();
  }

  registerDAG(workflowId, nodes) {
    // nodes: Array of { id, action, dependsOn: [], handler: async (context) => result }
    this.workflows.set(workflowId, nodes);
    console.log(\`[DAGEngine] Registered workflow '\${workflowId}' with \${nodes.length} nodes.\`);
  }

  async executeDAG(workflowId, initialContext = {}) {
    const nodes = this.workflows.get(workflowId);
    if (!nodes) {
      throw new Error(\`Workflow '\${workflowId}' not found.\`);
    }

    const context = { ...initialContext };
    const completed = new Set();
    const results = {};
    const pending = new Map(nodes.map(n => [n.id, n]));

    console.log(\`[DAGEngine] Executing DAG workflow '\${workflowId}'...\`);

    while (pending.size > 0) {
      const executable = [];

      for (const [id, node] of pending.entries()) {
        const dependenciesMet = (node.dependsOn || []).every(dep => completed.has(dep));
        if (dependenciesMet) {
          executable.push(node);
        }
      }

      if (executable.length === 0) {
        throw new Error(\`Circular dependency or unmet prerequisite detected in workflow '\${workflowId}'.\`);
      }

      // Execute all ready nodes in parallel
      await Promise.all(executable.map(async (node) => {
        try {
          console.log(\`[DAGEngine] Running Node: '\${node.id}'...\`);
          const res = await node.handler(context, results);
          results[node.id] = res;
          completed.add(node.id);
          pending.delete(node.id);
        } catch (err) {
          console.error(\`[DAGEngine] Node '\${node.id}' failed:\`, err.message);
          throw err;
        }
      }));
    }

    console.log(\`[DAGEngine] Workflow '\${workflowId}' executed successfully.\`);
    return { status: 'COMPLETED', results };
  }
}
`;

fs.writeFileSync(dagEnginePath, dagEngineCode, 'utf8');
console.log('✅ Created src/core/WorkflowDAGEngine.js');

// 2. Create E2E Verification Test (`src/cli/test-phase3.js`)
const testPath = path.join(process.cwd(), 'src', 'cli', 'test-phase3.js');
const testCode = `import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { WorkflowDAGEngine } from '../core/WorkflowDAGEngine.js';

async function runDAGTest() {
  console.log('================================================================');
  console.log('   PHASE 3 WORKFLOW DAG ENGINE VERIFICATION TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const dag = new WorkflowDAGEngine(kernel);

  // Register a multi-step dependency DAG
  dag.registerDAG('enterprise_onboarding_pipeline', [
    {
      id: 'validate_claims',
      dependsOn: [],
      handler: async (ctx) => {
        return { valid: true, user: ctx.userId || 'USR-101' };
      }
    },
    {
      id: 'generate_procarta_invoice',
      dependsOn: ['validate_claims'],
      handler: async (ctx, res) => {
        return { invoiceId: \`INV-\${res.validate_claims.user}-2026\`, amount: 1500 };
      }
    },
    {
      id: 'oracle_risk_assessment',
      dependsOn: ['validate_claims'],
      handler: async (ctx, res) => {
        return { riskScore: 0.02, decision: 'APPROVE' };
      }
    },
    {
      id: 'commit_ledger_entry',
      dependsOn: ['generate_procarta_invoice', 'oracle_risk_assessment'],
      handler: async (ctx, res) => {
        return { hash: '0x8f3c...b29a', status: 'COMMITTED' };
      }
    }
  ]);

  const output = await dag.executeDAG('enterprise_onboarding_pipeline', { userId: 'ADE-EXEC-01' });

  console.log('✅ DAG Pipeline Execution Result:');
  console.log(JSON.stringify(output, null, 2));

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runDAGTest().catch(console.error);
`;

fs.writeFileSync(testPath, testCode, 'utf8');
console.log('✅ Created src/cli/test-phase3.js');