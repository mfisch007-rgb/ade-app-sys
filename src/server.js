import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";

// Internal Subsystems & Route Imports
import adminRoutes from "./routes/admin.js";
import whatsappRoutes from "./routes/whatsapp.js";
import { startWhatsApp } from "./whatsapp/whatsappClient.js";
import { guardBot } from "./system/botGuardian.js";
import { supabase } from "./config/supabaseClient.js";
import { initMasterRegistry } from "./core/MasterIntegrationRegistry.js";

/**
 * =========================
 * PINO LOGGER
 * =========================
 */
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

/**
 * =========================
 * LOG HELPERS
 * =========================
 */
const log = {
  info: (m) => logger.info(`[INFO] ${new Date().toISOString()} | ${m}`),
  warn: (m) => logger.warn(`[WARN] ${new Date().toISOString()} | ${m}`),
  error: (m) => logger.error(`[ERROR] ${new Date().toISOString()} | ${m}`),
};

/**
 * =========================
 * GLOBAL KERNEL STATE
 * =========================
 */
const state = {
  mode: "FULL",
  whatsapp: false,
  lastFailure: null,
  failureCount: 0,
};

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * =========================
 * MIDDLEWARE
 * =========================
 */
app.use(cors());
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60000,
    max: 120,
  })
);

/**
 * =========================
 * SYSTEM ROOT
 * =========================
 */
app.get("/", (req, res) => {
  res.send("ADE-APEX ENTERPRISE CORE ONLINE");
});

/**
 * =========================
 * HEALTH DIAGNOSTICS ENDPOINT
 * =========================
 */
app.get("/health", async (req, res) => {
  try {
    const { error } = await supabase
      .from("clients")
      .select("id")
      .limit(1);

    res.json({
      system: "ADE-APEX",
      mode: state.mode,
      whatsapp: state.whatsapp ? "ok" : "down",
      database: error ? "error" : "ok",
      lastFailure: state.lastFailure,
      failureCount: state.failureCount,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      system: "ADE-APEX",
      mode: "SAFE",
      database: "error",
      error: err.message,
    });
  }
});

/**
 * =========================
 * ROUTE REGISTRATIONS
 * =========================
 */
app.use("/api/admin", adminRoutes);
app.use("/api/whatsapp", whatsappRoutes);

/**
 * =========================
 * FAILURE CLASSIFIER
 * =========================
 */
function classifyError(err) {
  const msg = err.message?.toLowerCase() || "";

  if (msg.includes("fetch")) return "NETWORK_ERROR";
  if (msg.includes("auth")) return "AUTH_ERROR";
  if (msg.includes("permission")) return "AUTH_ERROR";
  if (msg.includes("database")) return "DB_ERROR";

  return "CODE_ERROR";
}

/**
 * =========================
 * MODE ENGINE
 * =========================
 */
function updateMode(type) {
  if (type === "DB_ERROR" || type === "AUTH_ERROR") {
    state.mode = "SAFE";
  } else {
    state.mode = "DEGRADED";
  }
}

/**
 * =========================
 * SMART RECOVERY ENGINE
 * =========================
 */
function scheduleRecovery(type) {
  let delay = 5000;

  if (type === "AUTH_ERROR") delay = 60000;
  if (type === "NETWORK_ERROR") delay = 10000;
  if (type === "DB_ERROR") delay = 30000;

  log.warn(`Recovery scheduled in ${delay / 1000}s`);

  setTimeout(() => {
    startWhatsAppSafe();
  }, delay);
}

/**
 * =========================
 * WHATSAPP SAFE START
 * =========================
 */
async function startWhatsAppSafe() {
  try {
    log.info("Starting WhatsApp channel adapter...");

    const sock = await startWhatsApp();

    global.sock = sock;

    state.whatsapp = true;
    state.lastFailure = null;

    log.info("WhatsApp channel connected successfully.");

    guardBot();

    return sock;
  } catch (err) {
    const type = classifyError(err);

    state.whatsapp = false;
    state.lastFailure = type;
    state.failureCount++;

    updateMode(type);

    log.error(`WhatsApp connection failure: ${type}`);
    log.error(err.message);

    scheduleRecovery(type);

    return null;
  }
}

/**
 * =========================
 * DATABASE CHECK
 * =========================
 */
async function checkDatabase() {
  try {
    const { error } = await supabase
      .from("clients")
      .select("id")
      .limit(1);

    if (error) {
      state.mode = "SAFE";
      state.lastFailure = "DB_ERROR";

      log.warn("Database response degraded.");
    } else {
      log.info("Database connection OK.");
    }
  } catch (err) {
    state.mode = "SAFE";
    state.lastFailure = "DB_ERROR";

    log.error("Database connection unreachable.");
  }
}

/**
 * =========================
 * BOOT ENGINE
 * =========================
 */
async function boot() {
  log.info("Booting ADE-APEX Enterprise Kernel...");

  // 1. Initialize Master System Integration Registry cleanly before starting channels
  try {
    initMasterRegistry();
    log.info("Master Integration Registry initialized successfully.");
  } catch (regErr) {
    log.error(`Master Integration failure: ${regErr.message}`);
  }

  // 2. Perform Database & Channel Diagnostics
  await checkDatabase();
  await startWhatsAppSafe();

  log.info(`ADE-APEX Kernel running in mode: ${state.mode}`);
}

/**
 * =========================
 * START SERVER
 * =========================
 */
const server = app.listen(PORT, async () => {
  log.info(`ADE-APEX HTTP Gateway running on port ${PORT}`);
  await boot();
});

/**
 * =========================
 * PROCESS SAFETY & GRACEFUL SHUTDOWN
 * =========================
 */
process.on("uncaughtException", (e) => {
  log.error(`UNCAUGHT EXCEPTION: ${e.message}`);
});

process.on("unhandledRejection", (e) => {
  log.error(`UNHANDLED REJECTION: ${e}`);
});

process.on("SIGTERM", () => {
  log.info("SIGTERM received. Shutting down ADE-APEX Kernel gracefully...");
  server.close(() => {
    log.info("HTTP Server closed.");
    process.exit(0);
  });
});