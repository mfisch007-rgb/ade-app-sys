import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { CloudSignalPipelineEngine } from '../core/CloudSignalPipelineEngine.js';

async function runCloudPipelineTest() {
  console.log('================================================================');
  console.log('   GROUP 7: CLOUD INTEGRATION & MULTI-ASSET SIGNAL PIPELINE TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const pipeline = new CloudSignalPipelineEngine();

  // Test 1: Valid Cloud Signal Processing
  const validRes = await pipeline.processCloudSignal({
    asset: 'EUR/USD-OTC',
    action: 'BUY',
    zScore: 2.95,
    source: 'TELEGRAM_CLOUD_WORKER'
  });
  console.log('✅ Monitored Asset Signal Processing:', validRes.status === 'ACCEPTED' ? 'PASS' : 'FAIL');

  // Test 2: Invalid Asset Rejection
  const invalidRes = await pipeline.processCloudSignal({
    asset: 'UNSUPPORTED_TOKEN',
    action: 'BUY',
    zScore: 3.0
  });
  console.log('✅ Unmonitored Asset Rejection Guard:', invalidRes.status === 'REJECTED' ? 'PASS' : 'FAIL');

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runCloudPipelineTest().catch(console.error);
