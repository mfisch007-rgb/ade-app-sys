import crypto from 'crypto';

export class SecurityGateway {
  constructor({ secretKey = 'ade_apex_production_master_key', logger = console } = {}) {
    this.secretKey = secretKey;
    this.logger = logger;
    this.rateLimits = new Map(); // ip -> { count, resetTime }
    this.allowedRoles = new Set(['ADMIN', 'OPERATOR', 'SYSTEM']);
  }

  middleware() {
    return (req, res, next) => {
      // 1. HTTP Header Hardening (Helmet Standard)
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // 2. Rate Limiting (100 req/min per IP)
      const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
      const now = Date.now();
      const userLimit = this.rateLimits.get(clientIp) || { count: 0, resetTime: now + 60000 };

      if (now > userLimit.resetTime) {
        userLimit.count = 0;
        userLimit.resetTime = now + 60000;
      }

      userLimit.count++;
      this.rateLimits.set(clientIp, userLimit);

      if (userLimit.count > 100) {
        res.status(429).json({ error: 'Rate limit exceeded. Too many requests.' });
        return;
      }

      next();
    };
  }

  validateJWT(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('[SecurityGateway] Missing or malformed Authorization header.');
    }
    const token = authHeader.split(' ')[1];
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('[SecurityGateway] Invalid JWT token structure.');
    }

    const [header, payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSig) {
      throw new Error('[SecurityGateway] JWT Signature validation failed.');
    }

    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('[SecurityGateway] JWT Token has expired.');
    }

    return decodedPayload;
  }

  verifyRBAC(userRole, requiredRole) {
    if (!this.allowedRoles.has(userRole)) {
      throw new Error(`[SecurityGateway] Invalid identity role: ${userRole}`);
    }
    if (userRole !== 'ADMIN' && userRole !== requiredRole) {
      throw new Error(`[SecurityGateway] Access Denied: Requires role [${requiredRole}], got [${userRole}]`);
    }
    return true;
  }

  sanitizeInput(data) {
    if (typeof data === 'string') {
      return data.replace(/[<>'"]/g, ''); // Strip dangerous XSS / injection markers
    }
    if (typeof data === 'object' && data !== null) {
      for (const key of Object.keys(data)) {
        data[key] = this.sanitizeInput(data[key]);
      }
    }
    return data;
  }
}