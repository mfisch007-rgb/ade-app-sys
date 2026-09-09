import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { spawn } from "node:child_process";

function tempDir() {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "ade-g18-14-http-"
    )
  );
}

function waitForServer(
  child,
  baseUrl,
  timeoutMs = 12000
) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;

    const timer = setInterval(
      async () => {
        if (Date.now() - start > timeoutMs) {
          if (!settled) {
            settled = true;
            clearInterval(timer);
            reject(
              new Error(
                "SERVER_READINESS_TIMEOUT"
              )
            );
          }
          return;
        }

        try {
          const response =
            await fetch(
              `${baseUrl}/api/v1/capabilities`
            );

          if (response.ok && !settled) {
            settled = true;
            clearInterval(timer);
            resolve();
          }
        } catch {}

        if (child.exitCode !== null && !settled) {
          settled = true;
          clearInterval(timer);
          reject(
            new Error(
              `SERVER_EXITED_${child.exitCode}`
            )
          );
        }
      },
      150
    );
  });
}

async function post(
  baseUrl,
  route,
  body,
  token = null
) {
  const headers = {
    "content-type":
      "application/json"
  };

  if (token) {
    headers.authorization =
      `Bearer ${token}`;
  }

  const response =
    await fetch(
      `${baseUrl}${route}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }
    );

  return {
    status: response.status,
    body: await response.json()
  };
}

async function get(
  baseUrl,
  route,
  token = null
) {
  const headers = {};

  if (token) {
    headers.authorization =
      `Bearer ${token}`;
  }

  const response =
    await fetch(
      `${baseUrl}${route}`,
      {
        headers
      }
    );

  return {
    status: response.status,
    body: await response.json()
  };
}

test("G18.14 complete HTTP credential lifecycle", async () => {
  const dir = tempDir();

  const credentialStore =
    path.join(
      dir,
      "admin-credential.json"
    );

  const revocationFile =
    path.join(
      dir,
      "revocations.json"
    );

  const serverPort =
    36000 +
    Math.floor(
      Math.random() * 800
    );

  const oldPin = "246813";
  const rotatedPin = "135790";
  const recoveredPin = "975310";
  const recoveryKey =
    `ADE-RECOVERY-${crypto.randomUUID()}`;

  const pinHash =
    await bcrypt.hash(
      oldPin,
      12
    );

  const recoveryHash =
    await bcrypt.hash(
      recoveryKey,
      12
    );

  const env = {
    ...process.env,
    PORT: String(serverPort),
    ADE_RUNTIME_MODE: "COMMUNITY",
    ADE_ADMIN_PIN_HASH: pinHash,
    ADE_ADMIN_SESSION_LEVEL: "2",
    ADE_ADMIN_RECOVERY_KEY_HASH:
      recoveryHash,
    ADE_CREDENTIAL_STORE_FILE:
      credentialStore,
    ADE_SESSION_REVOCATION_FILE:
      revocationFile
  };

  const child =
    spawn(
      process.execPath,
      ["src/server.js"],
      {
        cwd: process.cwd(),
        env,
        stdio: [
          "ignore",
          "pipe",
          "pipe"
        ]
      }
    );

  let stdout = "";
  let stderr = "";

  child.stdout.on(
    "data",
    chunk => {
      stdout += chunk.toString();
    }
  );

  child.stderr.on(
    "data",
    chunk => {
      stderr += chunk.toString();
    }
  );

  const baseUrl =
    `http://127.0.0.1:${serverPort}`;

  try {
    await waitForServer(
      child,
      baseUrl
    );

    // ------------------------------------------------
    // LOGIN WITH ORIGINAL PIN
    // ------------------------------------------------
    const login1 =
      await post(
        baseUrl,
        "/api/v1/auth/pin",
        { pin: oldPin }
      );

    assert.equal(
      login1.status,
      200
    );

    assert.ok(
      login1.body.token
    );

    const token1 =
      login1.body.token;

    // ------------------------------------------------
    // CURRENT SESSION WORKS
    // ------------------------------------------------
    const access1 =
      await get(
        baseUrl,
        "/api/v1/cases",
        token1
      );

    assert.equal(
      access1.status,
      200
    );

    // ------------------------------------------------
    // ROTATE PIN
    // ------------------------------------------------
    const rotate =
      await post(
        baseUrl,
        "/api/v1/auth/rotate",
        {
          newPin: rotatedPin
        },
        token1
      );

    assert.equal(
      rotate.status,
      200
    );

    assert.equal(
      rotate.body.status,
      "CREDENTIAL_ROTATED"
    );

    assert.equal(
      rotate.body.credentialVersion,
      2
    );

    // ------------------------------------------------
    // EXISTING SESSION MUST NOW FAIL
    // ------------------------------------------------
    const staleAfterRotation =
      await get(
        baseUrl,
        "/api/v1/cases",
        token1
      );

    assert.equal(
      staleAfterRotation.status,
      401
    );

    // ------------------------------------------------
    // OLD PIN MUST FAIL
    // ------------------------------------------------
    const oldPinAfterRotation =
      await post(
        baseUrl,
        "/api/v1/auth/pin",
        { pin: oldPin }
      );

    assert.equal(
      oldPinAfterRotation.status,
      401
    );

    // ------------------------------------------------
    // NEW PIN MUST WORK
    // ------------------------------------------------
    const login2 =
      await post(
        baseUrl,
        "/api/v1/auth/pin",
        {
          pin: rotatedPin
        }
      );

    assert.equal(
      login2.status,
      200
    );

    const token2 =
      login2.body.token;

    assert.ok(token2);

    // ------------------------------------------------
    // CURRENT ROTATED SESSION WORKS
    // ------------------------------------------------
    const access2 =
      await get(
        baseUrl,
        "/api/v1/cases",
        token2
      );

    assert.equal(
      access2.status,
      200
    );

    // ------------------------------------------------
    // RECOVER PIN
    // ------------------------------------------------
    const recovery =
      await post(
        baseUrl,
        "/api/v1/auth/recover",
        {
          recoveryKey,
          newPin: recoveredPin
        }
      );

    assert.equal(
      recovery.status,
      200
    );

    assert.equal(
      recovery.body.status,
      "CREDENTIAL_RECOVERED"
    );

    assert.equal(
      recovery.body.credentialVersion,
      3
    );

    // ------------------------------------------------
    // ROTATED SESSION MUST NOW FAIL
    // ------------------------------------------------
    const staleAfterRecovery =
      await get(
        baseUrl,
        "/api/v1/cases",
        token2
      );

    assert.equal(
      staleAfterRecovery.status,
      401
    );

    // ------------------------------------------------
    // PREVIOUS PIN MUST FAIL
    // ------------------------------------------------
    const previousPinAfterRecovery =
      await post(
        baseUrl,
        "/api/v1/auth/pin",
        {
          pin: rotatedPin
        }
      );

    assert.equal(
      previousPinAfterRecovery.status,
      401
    );

    // ------------------------------------------------
    // RECOVERED PIN MUST WORK
    // ------------------------------------------------
    const login3 =
      await post(
        baseUrl,
        "/api/v1/auth/pin",
        {
          pin: recoveredPin
        }
      );

    assert.equal(
      login3.status,
      200
    );

    const token3 =
      login3.body.token;

    assert.ok(token3);

    const access3 =
      await get(
        baseUrl,
        "/api/v1/cases",
        token3
      );

    assert.equal(
      access3.status,
      200
    );

    // ------------------------------------------------
    // WRONG RECOVERY KEY MUST FAIL
    // ------------------------------------------------
    const badRecovery =
      await post(
        baseUrl,
        "/api/v1/auth/recover",
        {
          recoveryKey:
            "WRONG-RECOVERY-KEY",
          newPin: "112233"
        }
      );

    assert.equal(
      badRecovery.status,
      401
    );
  }
  finally {
    child.kill();

    await new Promise(
      resolve => {
        const done =
          () => resolve();

        child.once(
          "exit",
          done
        );

        setTimeout(
          done,
          3000
        );
      }
    );

    if (!fs.existsSync(
      credentialStore
    )) {
      throw new Error(
        "E2E_CREDENTIAL_STORE_NOT_CREATED"
      );
    }

    if (stderr.trim()) {
      console.log(
        "SERVER_STDERR_CAPTURED"
      );
    }

    if (stdout.trim()) {
      console.log(
        "SERVER_STDOUT_CAPTURED"
      );
    }
  }
});
