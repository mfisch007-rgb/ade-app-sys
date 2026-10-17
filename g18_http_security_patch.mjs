import fs from "node:fs";
import path from "node:path";

const appPath = path.resolve("src/app.js");
let text = fs.readFileSync(appPath, "utf8").replace(/\r\n/g, "\n");

function replaceExactly(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : pattern.flags + "g";

  const matcher = new RegExp(pattern.source, flags);
  const matches = [...source.matchAll(matcher)];

  if (matches.length !== 1) {
    throw new Error(`${label}_ANCHOR_COUNT_${matches.length}`);
  }

  return source.replace(pattern, replacement);
}

text = replaceExactly(
  text,
  /import \{ executeCapability \} from "\.\/core\/CapabilityExecutor\.js";/,
  'import { executeCapability } from "./core/CapabilityExecutor.js";\nimport HttpSecurityBoundary from "./security/HttpSecurityBoundary.js";',
  "SECURITY_IMPORT"
);

text = replaceExactly(
  text,
  /const app = express\(\);\napp\.use\(express\.json\(\)\);\napp\.use\(express\.urlencoded\(\{ extended: true \}\)\);/,
  'const app = express();\napp.use(express.json());\napp.use(express.urlencoded({ extended: true }));\n\nconst security = new HttpSecurityBoundary();',
  "SECURITY_INSTANCE"
);

text = replaceExactly(
  text,
  /\/\/ GATE 1 & 2: Auth[\s\S]*?\n\/\/ GATE 3: Telemetry Stream/,
  `// GATE 1 & 2: Auth
app.post("/api/v1/auth/pin", async (req, res) => {
  const { pin } = req.body || {};

  try {
    const session = await security.authenticatePin(pin);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "INVALID_CREDENTIALS"
      });
    }

    return res.status(200).json({
      success: true,
      authLevel: session.identity.level,
      token: session.token,
      expiresIn: session.expiresIn,
      expiresAt: session.expiresAt,
      identity: session.identity
    });
  } catch (error) {
    if (error?.message === "ADMIN_AUTH_NOT_CONFIGURED") {
      return res.status(503).json({
        success: false,
        error: "AUTH_NOT_CONFIGURED"
      });
    }

    logEvent("GUARDIAN", "Authentication boundary failure.");
    return res.status(500).json({
      success: false,
      error: "AUTHENTICATION_FAILED"
    });
  }
});

app.post("/api/v1/auth/revoke", security.requireAuth(), (req, res) => {
  try {
    const token = String(
      req.headers.authorization || ""
    ).slice(7);

    security.revokeToken(token);

    return res.status(200).json({
      success: true,
      status: "SESSION_REVOKED"
    });
  } catch {
    return res.status(401).json({
      success: false,
      error: "SESSION_REVOCATION_FAILED"
    });
  }
});

// GATE 3: Telemetry Stream`,
  "AUTH_BLOCK"
);

text = replaceExactly(
  text,
  /app\.post\("\/api\/command\/execute", async \(req, res\) => \{/,
  'app.post("/api/command/execute", security.requireAuth(), async (req, res) => {',
  "COMMAND_AUTH"
);

text = replaceExactly(
  text,
  /kernel\.dispatchIntent\(action, payload\)/,
  'kernel.dispatchIntent(action, payload, Number(req.identity?.level || 1))',
  "KERNEL_IDENTITY_LEVEL"
);

const caseRoutes = [
  ["app.get('/api/v1/cases',", "app.get('/api/v1/cases', security.requireAuth(),"],
  ["app.post('/api/v1/cases/:id/process',", "app.post('/api/v1/cases/:id/process', security.requireAuth(),"],
  ["app.post('/api/v1/cases/:id/execute',", "app.post('/api/v1/cases/:id/execute', security.requireAuth(),"],
  ["app.post('/api/v1/cases/:id/feedback',", "app.post('/api/v1/cases/:id/feedback', security.requireAuth(),"],
  ["app.get('/api/v1/cases/:id/transitions',", "app.get('/api/v1/cases/:id/transitions', security.requireAuth(),"],
  ["app.get('/api/v1/cases/:id',", "app.get('/api/v1/cases/:id', security.requireAuth(),"],
  ["app.patch('/api/v1/cases/:id',", "app.patch('/api/v1/cases/:id', security.requireAuth(),"]
];

for (const [anchor, replacement] of caseRoutes) {
  text = replaceExactly(
    text,
    new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    replacement,
    `CASE_ROUTE_${anchor}`
  );
}

const adminRoutes = [
  ["app.get('/api/v1/admin/overview',", "app.get('/api/v1/admin/overview', security.requireLevel(2),"],
  ["app.get('/api/v1/admin/channels',", "app.get('/api/v1/admin/channels', security.requireLevel(2),"],
  ["app.patch('/api/v1/admin/channels/:id',", "app.patch('/api/v1/admin/channels/:id', security.requireLevel(2),"],
  ["app.get('/api/v1/admin/connections',", "app.get('/api/v1/admin/connections', security.requireLevel(2),"],
  ["app.post('/api/v1/admin/connections',", "app.post('/api/v1/admin/connections', security.requireLevel(2),"],
  ["app.post('/api/v1/admin/connections/:id/test',", "app.post('/api/v1/admin/connections/:id/test', security.requireLevel(2),"],
  ["app.get('/api/v1/admin/partners',", "app.get('/api/v1/admin/partners', security.requireLevel(2),"],
  ["app.post('/api/v1/admin/partners',", "app.post('/api/v1/admin/partners', security.requireLevel(2),"],
  ["app.get('/api/v1/admin/settings',", "app.get('/api/v1/admin/settings', security.requireLevel(2),"],
  ["app.patch('/api/v1/admin/settings',", "app.patch('/api/v1/admin/settings', security.requireLevel(2),"]
];

for (const [anchor, replacement] of adminRoutes) {
  text = replaceExactly(
    text,
    new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    replacement,
    `ADMIN_ROUTE_${anchor}`
  );
}

fs.writeFileSync(appPath, text, "utf8");
console.log("APP_PATCH=PASS");

