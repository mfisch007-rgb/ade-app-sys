import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Atomic file replacement that never removes the existing target before the
 * replacement is safely in place.
 *
 * On POSIX, rename(tmp, target) atomically replaces the target. On Windows the
 * same rename can fail when the target is open by another process. The old
 * fallback in several stores deleted the target first; if the second rename
 * then failed, the original data was lost. This helper instead moves the
 * existing target to a same-directory backup, renames the temporary file into
 * place, and restores the backup if that fails. A failure therefore leaves the
 * last known-good file intact.
 */
export function atomicWriteFileSync(
  targetPath,
  data,
  options = {},
  fsImpl = fs
) {
  const target = path.resolve(targetPath);
  const dir = path.dirname(target);
  fsImpl.mkdirSync(dir, { recursive: true });

  const suffix = `${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}`;
  const tmp = `${target}.${suffix}.tmp`;
  const backup = `${target}.${suffix}.bak`;

  fsImpl.writeFileSync(tmp, data, options);

  try {
    fsImpl.renameSync(tmp, target);
    return { replaced: true, backupUsed: false };
  } catch (firstError) {
    let movedOriginal = false;
    try {
      if (fsImpl.existsSync(target)) {
        fsImpl.renameSync(target, backup);
        movedOriginal = true;
      }
    } catch {
      safeRemove(fsImpl, tmp);
      throw firstError;
    }

    if (!movedOriginal) {
      safeRemove(fsImpl, tmp);
      throw firstError;
    }

    try {
      fsImpl.renameSync(tmp, target);
      safeRemove(fsImpl, backup);
      return { replaced: true, backupUsed: true };
    } catch (secondError) {
      try {
        fsImpl.renameSync(backup, target);
      } catch {
        // The backup is intentionally left in place so an operator can
        // recover it manually; never delete the last known-good copy.
      }
      safeRemove(fsImpl, tmp);
      throw secondError;
    }
  }
}

function safeRemove(fsImpl, file) {
  try {
    if (fsImpl.existsSync(file)) fsImpl.rmSync(file, { force: true });
  } catch {}
}

export default atomicWriteFileSync;
