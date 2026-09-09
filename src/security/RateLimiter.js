/**
 * Minimal, self-contained fixed-window rate limiter for ADE HTTP surface.
 *
 * Provides brute-force throttling for sensitive endpoints (authentication,
 * PIN rotation, recovery) without adding an external dependency. It is a
 * bounded, per-client fixed-window counter with a testable seam.
 *
 * Security boundary:
 *  - Fans out by a stable client key (IP unless a trusted proxy header is
 *    enabled); never trusts arbitrary client-provided headers by default.
 *  - Exhaustion returns HTTP 429 (Too Many Requests) and emits a security
 *    event so the boundary is observable.
 *  - Windows/limits are configurable via environment with sane defaults.
 */

export class RateLimiter {
  constructor(options = {}) {
    this.windowMs =
      options.windowMs ?? Number(process.env.ADE_RATE_LIMIT_WINDOW_MS || 60000);
    this.max =
      options.max ?? Number(process.env.ADE_RATE_LIMIT_MAX || 20);
    this.stores = new Map();
  }

  /**
   * Testable seam: allow injecting a clock (or use wall time).
   */
  now() {
    return Date.now();
  }

  /**
   * Public key for a request. Uses the remote address by default. When
   * ADE_TRUST_PROXY is true, honors X-Forwarded-For (for deployments
   * behind a trusted proxy). Never trusts such headers otherwise.
   */
  clientKey(req) {
    const trustProxy =
      String(process.env.ADE_TRUST_PROXY || "").toLowerCase() === "true";
    if (trustProxy) {
      const forwarded = req.headers?.["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded.length) {
        return forwarded.split(",")[0].trim();
      }
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
  }

  /**
   * Attempt to consume one budget unit for the client key.
   * Returns true when allowed, false when the limit is exhausted.
   */
  attempt(req) {
    this.#prune();
    const key = this.clientKey(req);
    const time = this.now();
    let entry = this.stores.get(key);

    if (!entry || time - entry.startedAt >= this.windowMs) {
      entry = { startedAt: time, count: 0 };
      this.stores.set(key, entry);
    }

    entry.count += 1;
    return entry.count <= this.max;
  }

  /**
   * Bound in-memory growth so the limiter cannot be used as a memory
   * exhaustion vector. Called opportunistically on each attempt.
   */
  #prune() {
    if (this.stores.size > 10000) {
      const time = this.now();
      for (const [key, entry] of this.stores) {
        if (time - entry.startedAt >= this.windowMs) {
          this.stores.delete(key);
        }
      }
    }
  }

  middleware({ onLimited } = {}) {
    return (req, res, next) => {
      this.#prune();
      if (this.attempt(req)) return next();

      if (typeof onLimited === "function") {
        try {
          onLimited(req, res);
        } catch (_) {}
      }
      return res.status(429).json({
        success: false,
        error: "RATE_LIMIT_EXCEEDED"
      });
    };
  }
}

/**
 * Shared throttling boundary for authentication/credential endpoints.
 */
export function authRateLimit(onLimited) {
  return new RateLimiter({
    max: Number(process.env.ADE_AUTH_RATE_LIMIT_MAX || 10),
    windowMs: Number(process.env.ADE_AUTH_RATE_LIMIT_WINDOW_MS || 60000)
  }).middleware({ onLimited });
}

export default RateLimiter;
