import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
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
        return { invoiceId: `INV-${res.validate_claims.user}-2026`, amount: 1500 };
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
