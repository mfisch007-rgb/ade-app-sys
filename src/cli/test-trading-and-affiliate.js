import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';

async function main() {
  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();
  const lock = kernel.pluginRegistry.plugins.get('AffiliateLockPlugin');
  const zEngine = kernel.pluginRegistry.plugins.get('ZScoreExecutionEngine');
  console.log('🔍 Affiliate Key Test:', lock.verifyLicense('AFF-KEY-9981'));
  console.log('📈 Z-Score Signal Test:', zEngine.evaluateTradeSignal(105, 100, 2, 2.0));
  await kernel.shutdown();
}
main().catch(console.error);
