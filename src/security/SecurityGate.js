import jwt from 'jsonwebtoken';

export const AUTH_LEVELS = {
  PUBLIC: 0,
  AUTHENTICATED: 1,
  OPERATOR: 2,
  ADMIN: 3
};

export class SecurityGate {
  constructor(jwtSecret, kernelEventBus = null) {
    // LEGACY-ONLY gate — never grants canonical access (see src/app.js).
    // Fail closed: no hardcoded fallback secret. A missing secret verifies
    // nothing (verifyToken returns null, enforceLevel denies).
    this.jwtSecret = jwtSecret || null;
    this.kernelEventBus = kernelEventBus;
  }

  verifyToken(token) {
    if (!this.jwtSecret || !token) return null;
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (err) {
      return null;
    }
  }

  // Alias for backward compatibility
  verify(token) {
    return this.verifyToken(token);
  }

  enforceLevel(requiredLevel) {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (this.kernelEventBus) {
          this.kernelEventBus.emit('kernel_event', {
            event: 'RBAC_DENIED',
            message: `Access denied: Authentication token required for Level ${requiredLevel}`,
            timestamp: new Date().toISOString()
          });
        }
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication token required', 
          requiredLevel 
        });
      }

      const token = authHeader.split(' ')[1];
      const decoded = this.verifyToken(token);

      if (!decoded) {
        if (this.kernelEventBus) {
          this.kernelEventBus.emit('kernel_event', {
            event: 'RBAC_DENIED',
            message: 'Access denied: Invalid or expired JWT token',
            timestamp: new Date().toISOString()
          });
        }
        return res.status(403).json({ success: false, error: 'Invalid or expired token' });
      }

      if ((decoded.authLevel || 0) < requiredLevel) {
        if (this.kernelEventBus) {
          this.kernelEventBus.emit('kernel_event', {
            event: 'RBAC_DENIED',
            message: `Access denied: Insufficient privileges (User Level: ${decoded.authLevel || 0}, Required: ${requiredLevel})`,
            timestamp: new Date().toISOString()
          });
        }
        return res.status(403).json({ 
          success: false, 
          error: 'Insufficient authorization level', 
          userLevel: decoded.authLevel || 0, 
          requiredLevel 
        });
      }

      req.user = decoded;
      next();
    };
  }
}
