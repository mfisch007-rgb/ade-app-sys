import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class SnapshotManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.snapshotDir = path.join(process.cwd(), 'data', 'snapshots');
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  createSnapshot(reason = 'MANUAL_CHECKPOINT') {
    const timestamp = Date.now();
    const snapshotData = {
      timestamp,
      reason,
      version: '1.0.0',
      subsystems: Array.from(this.kernel.subsystems?.keys() || []),
      activePlugins: Object.keys(this.kernel.plugins || {})
    };

    const payload = JSON.stringify(snapshotData, null, 2);
    const checksum = crypto.createHash('sha256').update(payload).digest('hex');

    const fileName = `snapshot_${timestamp}.json`;
    const filePath = path.join(this.snapshotDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify({ checksum, payload: snapshotData }, null, 2), 'utf8');
    console.log(`[SnapshotManager] State snapshot persisted: ${fileName} (Checksum: ${checksum.slice(0, 8)})`);
    return { filePath, checksum };
  }

  verifyLatestSnapshot() {
    const files = fs.readdirSync(this.snapshotDir).filter(f => f.startsWith('snapshot_')).sort();
    if (files.length === 0) return { verified: false, reason: 'NO_SNAPSHOTS_FOUND' };

    const latestFile = files[files.length - 1];
    const raw = fs.readFileSync(path.join(this.snapshotDir, latestFile), 'utf8');
    const { checksum, payload } = JSON.parse(raw);

    const computedChecksum = crypto.createHash('sha256').update(JSON.stringify(payload, null, 2)).digest('hex');
    const isValid = checksum === computedChecksum;

    console.log(`[SnapshotManager] Latest Snapshot '${latestFile}' Verification: ${isValid ? 'VALID' : 'CORRUPTED'}`);
    return { verified: isValid, file: latestFile, payload };
  }
}
