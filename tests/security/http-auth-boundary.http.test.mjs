import { spawn } from "node:child_process";

const PORT = 31991;
const BASE = `http://127.0.0.1:${PORT}`;
const STARTUP_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 5000;

const pin = process.env.ADE_HTTP_TEST_PIN;

if (!pin || !/^\d{6}$/.test(pin)) {
  throw new Error("ADE_HTTP_TEST_PIN_NOT_CONFIGURED");
}

async function request(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
}

async function waitForServer() {
  const start = Date.now();

  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetch(
        `${BASE}/api/v1/capabilities`,
        {
          signal: AbortSignal.timeout(1000)
        }
      );

      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error("SERVER_READINESS_TIMEOUT");
}

const child = spawn(
  process.execPath,
  ["src/server.js"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      ADE_RUNTIME_MODE: "COMMUNITY"
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let stdout = "";
let stderr = "";

child.stdout.on("data", chunk => {
  stdout += chunk.toString();
});

child.stderr.on("data", chunk => {
  stderr += chunk.toString();
});

try {
  console.log("SERVER_START=INITIATED");

  await waitForServer();

  console.log("SERVER_READINESS=PASS");

  // A — No credentials.
  const unauth = await request(
    `${BASE}/api/command/execute`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "noop",
        payload: {}
      })
    }
  );

  console.log(`HTTP_UNAUTH_STATUS=${unauth.status}`);

  if (unauth.status !== 401) {
    throw new Error(
      `UNAUTH_EXPECTED_401_GOT_${unauth.status}`
    );
  }

  // B — Real configured PIN.
  const login = await request(
    `${BASE}/api/v1/auth/pin`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ pin })
    }
  );

  console.log(`HTTP_LOGIN_STATUS=${login.status}`);

  const loginBody = await login.json();

  if (login.status !== 200) {
    throw new Error(
      `LOGIN_FAILED_${login.status}_${JSON.stringify(loginBody)}`
    );
  }

  const token = loginBody?.token;

  if (!token || typeof token !== "string") {
    throw new Error("SESSION_TOKEN_MISSING");
  }

  console.log("SESSION_TOKEN=ISSUED");

  // C — Authenticated dispatch.
  const authorized = await request(
    `${BASE}/api/command/execute`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: "noop",
        payload: {}
      })
    }
  );

  console.log(
    `HTTP_AUTH_DISPATCH_STATUS=${authorized.status}`
  );

  if (
    authorized.status === 401 ||
    authorized.status === 403
  ) {
    throw new Error(
      `AUTH_DISPATCH_REJECTED_${authorized.status}`
    );
  }

  // D — Revoke.
  const revoke = await request(
    `${BASE}/api/v1/auth/revoke`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );

  console.log(`HTTP_REVOKE_STATUS=${revoke.status}`);

  if (revoke.status !== 200) {
    throw new Error(`REVOKE_FAILED_${revoke.status}`);
  }

  // E — Revoked token.
  const revoked = await request(
    `${BASE}/api/command/execute`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: "noop",
        payload: {}
      })
    }
  );

  console.log(
    `HTTP_REVOKED_DISPATCH_STATUS=${revoked.status}`
  );

  if (revoked.status !== 401) {
    throw new Error(
      `REVOKED_SESSION_EXPECTED_401_GOT_${revoked.status}`
    );
  }

  console.log("HTTP_AUTH_REGRESSION=PASS");

} catch (error) {
  console.error("HTTP_AUTH_REGRESSION=FAIL");
  console.error(String(error));

  if (stdout) {
    console.error("\nSERVER_STDOUT:\n" + stdout);
  }

  if (stderr) {
    console.error("\nSERVER_STDERR:\n" + stderr);
  }

  process.exitCode = 1;

} finally {
  child.kill();
}
