import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, authRateLimit } from "../../src/security/RateLimiter.js";

function fakeReq(ip, headers = {}) {
  return {
    ip,
    socket: { remoteAddress: ip },
    headers
  };
}

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

test("G18: rate limiter allows requests within the window", () => {
  const limiter = new RateLimiter({ windowMs: 60000, max: 5 });
  limiter.now = () => 1000000;

  const req = fakeReq("1.2.3.4");
  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.attempt(req), true, `request ${i + 1} allowed`);
  }
});

test("G18: rate limiter rejects requests past the limit", () => {
  const limiter = new RateLimiter({ windowMs: 60000, max: 5 });
  limiter.now = () => 1000000;

  const req = fakeReq("5.6.7.8");
  for (let i = 0; i < 5; i++) limiter.attempt(req);
  assert.equal(limiter.attempt(req), false);
});

test("G18: rate limiter fans out by client", () => {
  const limiter = new RateLimiter({ windowMs: 60000, max: 2 });
  limiter.now = () => 1000000;

  const a = fakeReq("10.0.0.1");
  const b = fakeReq("10.0.0.2");

  limiter.attempt(a);
  limiter.attempt(a);
  assert.equal(limiter.attempt(a), false, "client A exhausted");
  assert.equal(limiter.attempt(b), true, "client B unaffected");
});

test("G18: rate limiter resets after the window elapses", () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 2 });
  limiter.now = () => 0;

  const req = fakeReq("192.168.1.1");
  limiter.attempt(req);
  limiter.attempt(req);
  assert.equal(limiter.attempt(req), false);

  limiter.now = () => 2000;
  assert.equal(limiter.attempt(req), true, "fresh window allows again");
});

test("G18: rate limit middleware returns 429 on exhaustion", () => {
  const limiter = new RateLimiter({ windowMs: 60000, max: 1 });
  limiter.now = () => 1000000;

  const middleware = limiter.middleware();
  let calls = 0;
  const next = () => { calls += 1; };
  const req = fakeReq("203.0.113.9");
  const res = fakeRes();

  middleware(req, res, next);
  assert.equal(calls, 1, "first request forwarded");

  middleware(req, res, next);
  assert.equal(res.statusCode, 429, "second request limited");
  assert.deepEqual(res.body, { success: false, error: "RATE_LIMIT_EXCEEDED" });
});

test("G18: auth rate limiter builder returns usable middleware", () => {
  const middleware = authRateLimit();
  assert.equal(typeof middleware, "function");
});
