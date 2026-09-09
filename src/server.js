import app, { kernel, kernelReady, storageHydration } from "./app.js";

const PORT = process.env.PORT || 3000;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[ADE-APEX] ${signal} received. Initiating graceful shutdown...`);

  try {
    if (kernel && typeof kernel.shutdown === "function") {
      await kernel.shutdown();
      console.log("[ADE-APEX] Kernel shutdown complete.");
    }
  } catch (err) {
    console.error("[ADE-APEX] Kernel shutdown error:", err.message);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("[ADE-APEX] Uncaught exception:", err.message);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[ADE-APEX] Unhandled rejection:", reason);
});

await Promise.all([kernelReady, storageHydration]);

app.listen(PORT, () => {
  console.log(`[ADE-APEX KERNEL] Server online at http://localhost:${PORT}`);
});
