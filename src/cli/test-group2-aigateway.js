import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { AIGatewayEngine } from '../core/AIGatewayEngine.js';

async function runAIGatewayTest() {
  console.log('================================================================');
  console.log('   GROUP 2: AI GATEWAY & SEMANTIC CACHE ENGINE TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const aiGateway = new AIGatewayEngine({ tokenBudget: 50000 });

  // Test 1: Cold Prompt Execution
  const res1 = await aiGateway.dispatchPrompt('Analyze Z-Score anomaly for EUR/USD', { preferredProvider: 'gemini' });
  console.log('✅ First Call (Cold):', res1.cached === false && res1.providerUsed === 'gemini' ? 'PASS' : 'FAIL');

  // Test 2: Identical Prompt Execution (Cache Hit Test)
  const res2 = await aiGateway.dispatchPrompt('Analyze Z-Score anomaly for EUR/USD');
  console.log('✅ Second Call (Semantic Cache Hit):', res2.cached === true && res2.providerUsed === 'CACHE' ? 'PASS' : 'FAIL');

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runAIGatewayTest().catch(console.error);
