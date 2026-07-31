import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";

import adminRoutes from "./routes/admin.js";
import { startWhatsApp } from "./whatsapp/whatsappClient.js";
import { guardBot } from "./system/botGuardian.js";
import { supabase } from "./config/supabaseClient.js";

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
  info: (m) =>
    logger.info(`[INFO] ${new Date().toISOString()} | ${m}`),

  warn: (m) =>
    logger.warn(`[WARN] ${new Date().toISOString()} | ${m}`),

  error: (m) =>
    logger.error(`[ERROR] ${new Date().toISOString()} | ${m}`),
};

/**
 * =========================
 * GLOBAL STATE
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
 * ROOT
 */
app.get("/", (req, res) => {
  res.send("ADE-AWBULI INTELLIGENT CORE ONLINE");
});

/**
 * =========================
 * HEALTH CHECK
 * =========================
 */
app.get("/health", async (req, res) => {
  try {
    const { error } = await supabase
      .from("clients")
      .select("id")
      .limit(1);

    res.json({
      system: "ADE-AWBULI",
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
      system: "ADE-AWBULI",
      mode: "SAFE",
      database: "error",
      error: err.message,
    });
  }
});

/**
 * ADMIN ROUTES
 */
app.use("/api/admin", adminRoutes);

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
  if (type === "DB_ERROR") {
    state.mode = "SAFE";
  } else if (type === "NETWORK_ERROR") {
    state.mode = "DEGRADED";
  } else if (type === "AUTH_ERROR") {
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
    log.info("Starting WhatsApp...");

    const sock = await startWhatsApp();

    global.sock = sock;

    state.whatsapp = true;
    state.lastFailure = null;

    log.info("WhatsApp connected");

    guardBot();

    return sock;
  } catch (err) {
    const type = classifyError(err);

    state.whatsapp = false;
    state.lastFailure = type;
    state.failureCount++;

    updateMode(type);

    log.error(`WhatsApp failure: ${type}`);
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

      log.warn("DB degraded");
    } else {
      log.info("DB OK");
    }
  } catch (err) {
    state.mode = "SAFE";
    state.lastFailure = "DB_ERROR";

    log.error("DB unreachable");
  }
}

/**
 * =========================
 * BOOT ENGINE
 * =========================
 */
async function boot() {
  log.info("Booting ADE-AWBULI PHASE 4...");

  await checkDatabase();
  await startWhatsAppSafe();

  log.info(`System running in mode: ${state.mode}`);
}

/**
 * =========================
 * START SERVER
 * =========================
 */
app.listen(PORT, () => {
  log.info(`Server running on ${PORT}`);

  boot();
});

/**
 * =========================
 * PROCESS SAFETY
 * =========================
 */
process.on("uncaughtException", (e) => {
  log.error(`UNCAUGHT EXCEPTION: ${e.message}`);
});

process.on("unhandledRejection", (e) => {
  log.error(`UNHANDLED REJECTION: ${e}`);
});