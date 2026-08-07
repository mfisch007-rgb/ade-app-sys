import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { SnapshotManager } from '../core/SnapshotManager.js';

async function runSnapshotTest() {
  console.log('================================================================');
  console.log('   PHASE 4 PERSISTENCE & SNAPSHOT VERIFICATION TEST');
  console.log('================================================================');

  const kernel = new EnterpriseKernelMaster();
  await kernel.boot();

  const snapshotMgr = new SnapshotManager(kernel);

  // Take system snapshot
  const snapshot = snapshotMgr.createSnapshot('SHUTDOWN_AUTO_CHECKPOINT');

  // Verify integrity of persisted snapshot
  const result = snapshotMgr.verifyLatestSnapshot();

  console.log('✅ Snapshot Integrity Verification Status:', result.verified ? 'PASS' : 'FAIL');

  await kernel.shutdown();
  console.log('================================================================');
  process.exit(0);
}

runSnapshotTest().catch(console.error);
