import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Test isolation guard, preloaded with `node --import`.
 *
 * Tests must never write into the live repository. The runner executes with a
 * disposable sandbox as the working directory; this guard additionally rejects
 * writes that resolve inside the repository but outside that sandbox. Reads are
 * intentionally unrestricted so tests can inspect canonical source files.
 */

const sandbox = process.env.ADE_TEST_SANDBOX_ROOT
  ? path.resolve(process.env.ADE_TEST_SANDBOX_ROOT)
  : null;
const repoRoot = process.env.ADE_TEST_REPO_ROOT
  ? path.resolve(process.env.ADE_TEST_REPO_ROOT)
  : null;

if (sandbox && repoRoot) {
  const sandboxPrefix = withSeparator(sandbox);
  const repoPrefix = withSeparator(repoRoot);
  const tempPrefix = withSeparator(path.resolve(os.tmpdir()));
  const original = {
    writeFileSync: fs.writeFileSync,
    appendFileSync: fs.appendFileSync,
    renameSync: fs.renameSync,
    copyFileSync: fs.copyFileSync,
    cpSync: fs.cpSync,
    rmSync: fs.rmSync,
    unlinkSync: fs.unlinkSync,
    mkdirSync: fs.mkdirSync,
    createWriteStream: fs.createWriteStream
  };

  const assertAllowed = (target, operation) => {
    if (target == null) return;
    let resolved;
    try {
      resolved = path.resolve(targetToPath(target));
    } catch {
      return;
    }
    const normalized = withSeparator(resolved);
    const inSandbox = normalized.startsWith(sandboxPrefix);
    const inTemp = normalized.startsWith(tempPrefix);
    const inRepo = normalized.startsWith(repoPrefix);
    if (inRepo && !inSandbox && !inTemp) {
      const error = new Error(
        `TEST_ISOLATION_WRITE_DENIED:${operation}:${resolved}`
      );
      error.code = "TEST_ISOLATION_WRITE_DENIED";
      throw error;
    }
  };

  fs.writeFileSync = function guardedWriteFileSync(file, ...rest) {
    assertAllowed(file, "writeFileSync");
    return original.writeFileSync.call(this, file, ...rest);
  };
  fs.appendFileSync = function guardedAppendFileSync(file, ...rest) {
    assertAllowed(file, "appendFileSync");
    return original.appendFileSync.call(this, file, ...rest);
  };
  fs.renameSync = function guardedRenameSync(from, to, ...rest) {
    assertAllowed(from, "renameSync:source");
    assertAllowed(to, "renameSync:target");
    return original.renameSync.call(this, from, to, ...rest);
  };
  fs.copyFileSync = function guardedCopyFileSync(from, to, ...rest) {
    assertAllowed(to, "copyFileSync:target");
    return original.copyFileSync.call(this, from, to, ...rest);
  };
  fs.cpSync = function guardedCpSync(from, to, ...rest) {
    assertAllowed(to, "cpSync:target");
    return original.cpSync.call(this, from, to, ...rest);
  };
  fs.rmSync = function guardedRmSync(target, options) {
    assertAllowed(target, "rmSync");
    assertNotRepositoryTarget(target, "rmSync", sandboxPrefix, repoPrefix);
    return original.rmSync.call(this, target, options);
  };
  fs.unlinkSync = function guardedUnlinkSync(target) {
    assertNotRepositoryTarget(target, "unlinkSync", sandboxPrefix, repoPrefix);
    return original.unlinkSync.call(this, target);
  };
  fs.mkdirSync = function guardedMkdirSync(target, ...rest) {
    assertAllowed(target, "mkdirSync");
    return original.mkdirSync.call(this, target, ...rest);
  };
  fs.createWriteStream = function guardedCreateWriteStream(target, ...rest) {
    assertAllowed(target, "createWriteStream");
    return original.createWriteStream.call(this, target, ...rest);
  };
}

function assertNotRepositoryTarget(target, operation, sandboxPrefix, repoPrefix) {
  let resolved;
  try {
    resolved = path.resolve(targetToPath(target));
  } catch {
    return;
  }
  const normalized = withSeparator(resolved);
  if (normalized.startsWith(repoPrefix) && !normalized.startsWith(sandboxPrefix)) {
    const error = new Error(
      `TEST_ISOLATION_DELETE_DENIED:${operation}:${resolved}`
    );
    error.code = "TEST_ISOLATION_DELETE_DENIED";
    throw error;
  }
}

function targetToPath(target) {
  if (target instanceof URL) return target;
  if (Buffer.isBuffer(target)) return target.toString();
  return String(target);
}

function withSeparator(value) {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}
