const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:"
].join("; ");

const isProduction = () =>
  Boolean(process.env.VERCEL) ||
  String(process.env.VERCEL_ENV || "").toLowerCase() === "production" ||
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

export function httpSecurityHeaders() {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);

    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const secureRequest = Boolean(req.secure) || forwardedProto === "https";
    if (secureRequest || isProduction()) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}

export { CONTENT_SECURITY_POLICY };

export default httpSecurityHeaders;
