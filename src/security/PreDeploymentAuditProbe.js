import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import CommunityEditionGuard from "./CommunityEditionGuard.js";
import UniversalAIGateway from "../ai/UniversalAIGateway.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PreDeploymentAuditProbe {
  constructor() {
    this.guard = CommunityEditionGuard.getInstance();
    this.aiGateway = UniversalAIGateway.getInstance();
  }

  async runFullPreDeploymentAudit() {
    const auditResults = {
      timestamp: new Date().toISOString(),
      edition: this.guard.getEditionLimits().edition,
      checks: []
    };

    // Check 1: Directory Integrity
    const requiredDirs = ["src/ai", "src/telemetry", "src/kernel", "src/security"];
    for (const dir of requiredDirs) {
      const fullPath = path.resolve(__dirname, "../../", dir);
      const exists = fs.existsSync(fullPath);
      auditResults.checks.push({
        check: `[DIRECTORY INTEGRITY] ${dir}`,
        status: exists ? "PASS" : "FAIL"
      });
      if (!exists) throw new Error(`Essential directory missing: ${dir}`);
    }

    // Check 2: Capability Restriction Verification
    try {
      this.guard.assertCapabilityAllowed("TELEMETRY_SSE");
      auditResults.checks.push({
        check: "[CAPABILITY GUARD] Permitted feature execution",
        status: "PASS"
      });
    } catch (e) {
      auditResults.checks.push({
        check: "[CAPABILITY GUARD] Permitted feature execution",
        status: "FAIL",
        reason: e.message
      });
    }

    // Check 3: Block Enterprise Feature Verification
    let blockedFeaturePassed = false;
    try {
      this.guard.assertCapabilityAllowed("MULTI_ASSET_UNLIMITED_SCALING");
    } catch (e) {
      blockedFeaturePassed = true;
    }

    if (blockedFeaturePassed) {
      auditResults.checks.push({
        check: "[CAPABILITY GUARD] Enterprise feature restriction enforcement",
        status: "PASS"
      });
    } else {
      throw new Error("Community Guard allowed unauthorized Enterprise feature!");
    }

    // Check 4: Fix Fault 5 - Asset Limit Boundary Audit
    try {
      this.guard.validateAssetLimit(2); // Valid limit
      auditResults.checks.push({
        check: "[ASSET BOUNDARY GUARD] Valid concurrent asset limit (<= 2)",
        status: "PASS"
      });
    } catch (e) {
      throw new Error(`Asset boundary valid check failed: ${e.message}`);
    }

    let assetOverlimitBlocked = false;
    try {
      this.guard.validateAssetLimit(5); // Invalid limit
    } catch (e) {
      assetOverlimitBlocked = true;
    }

    if (assetOverlimitBlocked) {
      auditResults.checks.push({
        check: "[ASSET BOUNDARY GUARD] Excessive asset limit block (> 2)",
        status: "PASS"
      });
    } else {
      throw new Error("Community Guard failed to block excessive asset count!");
    }

    // Check 5: Primary Provider Sanity Verification
    const metrics = this.aiGateway.getMetrics();
    auditResults.checks.push({
      check: `[PROVIDER SANITY GUARD] Configured primary provider: ${metrics.configuredPrimaryProvider}`,
      status: ["gemini", "groq", "deepseek", "qwen"].includes(metrics.configuredPrimaryProvider) ? "PASS" : "FAIL"
    });

    return auditResults;
  }
}

export default PreDeploymentAuditProbe;
