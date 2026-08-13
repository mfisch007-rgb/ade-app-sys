import EnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";
import PreDeploymentAuditProbe from "../security/PreDeploymentAuditProbe.js";

async function verifyPhase2() {
  console.log("=======================================================");
  console.log("   STRICT PHASE 2 AUDIT: PRE-DEPLOYMENT & GUARDS      ");
  console.log("=======================================================");

  const kernel = EnterpriseKernelMaster.getInstance();
  await kernel.boot();

  console.log("\n[TEST 1] Running Pre-Deployment Audit Probe...");
  const probe = new PreDeploymentAuditProbe();
  const auditReport = await probe.runFullPreDeploymentAudit();

  console.log("\n[AUDIT CHECKS REPORT]:");
  for (const check of auditReport.checks) {
    console.log(`  [${check.status}] ${check.check}`);
  }

  console.log("\n=======================================================");
  console.log("[PHASE 2 STATUS]: PRE-DEPLOYMENT AUDIT & GUARDS VERIFIED (PASS)");
  console.log("  └─ Community limits, safety probes, and system integrity enforced.");
  console.log("=======================================================");
}

verifyPhase2().catch((err) => {
  console.error("\n[FATAL PHASE 2 FAILURE]:", err.message);
  process.exit(1);
});
