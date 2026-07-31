import "dotenv/config";
import cron from "node-cron";

import db from "./config/database.js";

import {
  cleanupStaleOnboarding,
} from "./engines/onboardingEngine.js";

import {
  runSubscriptionWarnings,
  expireOverdueSubscriptions,
} from "./engines/subscriptionEngine.js";

import {
  runAutomatedDailyReports,
} from "./engines/reportEngine.js";

import {
  detectAgentFraud,
} from "./engines/securityEngine.js";

function safeJob(name, fn) {
  return async () => {
    try {
      console.log(`🚀 Running: ${name}`);
      await fn();
      console.log(`✅ Finished: ${name}`);
    } catch (err) {
      console.error(`❌ ${name} failed:`, err.message);
    }
  };
}

async function databaseHealthCheck() {
  await db.query("SELECT NOW()");
}

async function fraudCheck() {
  const agents = await db.getMany(
    `SELECT agent_id FROM agents WHERE status='active'`
  );

  for (const agent of agents) {
    await detectAgentFraud(agent.agent_id);
  }
}

function startScheduler() {
  console.log("⏰ Scheduler booting...");

  cron.schedule(
    "0 20 * * *",
    safeJob("Daily Reports", runAutomatedDailyReports),
    { timezone: "Africa/Lagos" }
  );

  cron.schedule(
    "0 9 * * *",
    safeJob("Subscription Warnings", runSubscriptionWarnings),
    { timezone: "Africa/Lagos" }
  );

  cron.schedule(
    "1 0 * * *",
    safeJob("Expire Subscriptions", expireOverdueSubscriptions),
    { timezone: "Africa/Lagos" }
  );

  cron.schedule(
    "0 * * * *",
    safeJob("DB Health Check", databaseHealthCheck),
    { timezone: "Africa/Lagos" }
  );

  cron.schedule(
    "0 * * * *",
    safeJob("Cleanup Onboarding", cleanupStaleOnboarding),
    { timezone: "Africa/Lagos" }
  );

  cron.schedule(
    "0 23 * * *",
    safeJob("Fraud Detection", fraudCheck),
    { timezone: "Africa/Lagos" }
  );

  console.log("✅ Scheduler active");
}

export { startScheduler };
