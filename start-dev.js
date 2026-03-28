import "dotenv/config";
import './src/system/healthMonitor.js';
import { startWhatsApp } from "./src/whatsapp/whatsappClient.js";

// Import workers so they are ready for the queue
import "./src/workers/messageWorker.js";
import "./src/workers/eventWorker.js";

async function launchSystem() {
  console.log("🚀 Starting LedgerFlow System...");

  try {
    // startWhatsApp returns the 'sock' object
    const sock = await startWhatsApp();

    if (sock) {
      console.log("✅ Main Process: Logic Handlers Active");
    }
  } catch (error) {
    console.error("❌ Critical Startup Error:", error.message);
    process.exit(1);
  }
}

// Global error handling for the process
process.on("unhandledRejection", (err) => {
  console.error("⚠️ Unhandled Promise Rejection:", err.message);
});

launchSystem();