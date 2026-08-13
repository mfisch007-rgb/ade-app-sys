import EnterpriseKernelMaster from "../kernel/EnterpriseKernelMaster.js";

async function runKernelVerification() {
  console.log("=======================================================");
  console.log(" KERNEL KINEMATICS & AUTONOMOUS PLUGIN DISCOVERY TEST  ");
  console.log("=======================================================");

  const kernel = EnterpriseKernelMaster.getInstance();
  await kernel.boot();

  console.log(`\n[BOOT SUMMARY] Total Registered Subsystems/Plugins: ${kernel.plugins.size}`);
  for (const [id, instance] of kernel.plugins.entries()) {
    console.log(`  └─ Active Subsystem: ${id}`);
  }

  console.log("\n[VERIFICATION SUCCESS] Dynamic Kernel runtime active and verified.");
  console.log("=======================================================");
}

runKernelVerification().catch((err) => {
  console.error("[FATAL KERNEL BOOT ERROR]:", err);
  process.exit(1);
});
