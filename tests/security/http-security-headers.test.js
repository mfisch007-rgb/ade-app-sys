import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, kernelReady } from "../../src/app.js";

let server = null;
let baseUrl = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("canonical responses carry baseline security headers and a restrictive CSP", async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);

  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("permissions-policy") || "", /geolocation=\(\)/);

  const csp = response.headers.get("content-security-policy") || "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src [^;]*https:\/\/unpkg\.com/);
  assert.doesNotMatch(csp, /script-src[^;]*\*/);
});

test("HSTS is emitted for HTTPS-forwarded requests and omitted for plain local HTTP", async () => {
  const plain = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(plain.headers.get("strict-transport-security"), null);

  const forwarded = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { "x-forwarded-proto": "https" }
  });
  assert.match(forwarded.headers.get("strict-transport-security") || "", /max-age=31536000/);
});
