// ═══════════════════════════════════════════════════════════
// Alpha-Aliph ADE-LedgerFlow™ — Client Onboarding Engine
// File: src/engines/onboardingEngine.js
//
// SECURITY FIXES:
//   FIX 1: PIN never stored in plaintext — hashed immediately in pin1
//   FIX 2: bcrypt failure = hard error, onboarding blocked
//   FIX 3: Row-level lock prevents race condition on double-send
//   FIX 4: Stale onboarding data auto-cleared after 24 hours
//   FIX 5: Input sanitization on names
// ═══════════════════════════════════════════════════════════

import "dotenv/config";
import bcrypt from "bcrypt";
import db from "../config/database.js";

// ─────────────────────────────────────────────────────────────
// VERIFY BCRYPT
// ─────────────────────────────────────────────────────────────
if (!bcrypt) {
  console.error("═══════════════════════════════════════════════════");
  console.error("FATAL: bcrypt failed to load.");
  console.error("Run: npm install bcrypt");
  console.error("═══════════════════════════════════════════════════");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// INPUT SANITIZER
// ─────────────────────────────────────────────────────────────
function sanitizeName(input) {
  if (!input) return "";

  return input
    .trim()
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100);
}

function sanitizeBusinessName(input) {
  return sanitizeName(input)
    .replace(/[;'"\\]/g, "")
    .substring(0, 100);
}

function validatePin(pin) {
  if (!pin) return false;

  const clean = pin.trim().replace(/\s/g, "");

  return /^\d{6}$/.test(clean);
}

// ─────────────────────────────────────────────────────────────
// GET LOCKED CLIENT ROW
// ─────────────────────────────────────────────────────────────
async function getOnboardingStateLocked(phone, dbClient) {
  const result = await dbClient.query(
    `
      SELECT
        id,
        phone,
        owner_name,
        business_name,
        onboarded,
        onboarding_state,
        onboarding_data,
        language,
        currency_symbol,
        created_at,
        plan,
        status,
        trial_ends_at
      FROM clients
      WHERE phone = $1
      FOR UPDATE
    `,
    [phone]
  );

  return result.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────
// MAIN ONBOARDING ENGINE
// ─────────────────────────────────────────────────────────────
async function handleOnboarding(phone, text, langCode = "en") {
  return db.transaction(async (txClient) => {
    const client = await getOnboardingStateLocked(phone, txClient);

    if (!client) return null;

    const state = client.onboarding_state || "awaiting_start";
    const lang = client.language || langCode || "en";

    if (client.onboarded && state === "complete") {
      return null;
    }

    // Expire stale sessions
    const ageHours =
      (Date.now() - new Date(client.created_at).getTime()) / 3600000;

    if (
      ageHours > 24 &&
      state !== "awaiting_start" &&
      state !== "complete"
    ) {
      await txClient.query(
        `
          UPDATE clients
          SET onboarding_state = 'awaiting_start',
              onboarding_data = NULL
          WHERE phone = $1
        `,
        [phone]
      );

      return (
        `⏰ *Session Expired*\n\n` +
        `Your setup session expired after 24 hours.\n` +
        `Type *START* to begin again.`
      );
    }

    const upper = text.trim().toUpperCase();

    switch (state) {

      // ─────────────────────────────────────────────
      // START
      // ─────────────────────────────────────────────
      case "awaiting_start": {

        if (!upper.startsWith("START")) {
          return (
            `👋 *Welcome to ADE-LedgerFlow™*\n\n` +
            `_by Alpha-Aliph Automated Digital Enterprise_\n\n` +
            `Your account is ready to activate.\n` +
            `Type *START* to begin setup ⬇️`
          );
        }

        await txClient.query(
          `
            UPDATE clients
            SET onboarding_state = 'name',
                language = $2
            WHERE phone = $1
          `,
          [phone, lang]
        );

        return getWelcomeMessage(lang);
      }

      // ─────────────────────────────────────────────
      // NAME
      // ─────────────────────────────────────────────
      case "name": {

        const rawName = text.trim();
        const name = sanitizeName(rawName);

        if (name.length < 2) {
          return (
            `❌ Please enter your *full legal name*.\n\n` +
            `Example: _Adewale Okafor_`
          );
        }

        await txClient.query(
          `
            UPDATE clients
            SET owner_name = $2,
                onboarding_state = 'business'
            WHERE phone = $1
          `,
          [phone, name]
        );

        return (
          `✅ *Name saved:* ${name}\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📝 *Question 2 of 3*\n\n` +
          `What is your *business or store name*?\n\n` +
          `_Example: Okafor Electronics_`
        );
      }

      // ─────────────────────────────────────────────
      // BUSINESS
      // ─────────────────────────────────────────────
      case "business": {

        const rawBiz = text.trim();
        const biz = sanitizeBusinessName(rawBiz);

        if (biz.length < 2) {
          return (
            `❌ Please enter your *business or store name*.\n\n` +
            `Example: _Mama Titi Provisions_`
          );
        }

        await txClient.query(
          `
            UPDATE clients
            SET business_name = $2,
                onboarding_state = 'pin1',
                onboarding_data = NULL
            WHERE phone = $1
          `,
          [phone, biz]
        );

        return (
          `✅ *Business saved:* ${biz}\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📝 *Question 3 of 3 — Security PIN*\n\n` +
          `🔐 Create your *6-digit PIN*\n\n` +
          `This PIN secures your account.\n` +
          `_Never share it with anyone — not even ADE staff._\n\n` +
          `Enter your 6-digit PIN now:`
        );
      }

      // ─────────────────────────────────────────────
      // PIN1
      // ─────────────────────────────────────────────
      case "pin1": {

        const pin = text.trim().replace(/\s/g, "");

        if (!validatePin(pin)) {
          return (
            `❌ PIN must be exactly *6 digits*.\n\n` +
            `Example: _123456_\n\n` +
            `Try again:`
          );
        }

        let pinHash;

        try {
          pinHash = await bcrypt.hash(
            pin + (process.env.PIN_PEPPER || ""),
            12
          );
        } catch (err) {
          console.error(
            "SECURITY ERROR: bcrypt hash failed:",
            err.message
          );

          return (
            `🔴 *Security Error*\n\n` +
            `Could not secure your PIN.\n` +
            `Please try again later.`
          );
        }

        await txClient.query(
          `
            UPDATE clients
            SET onboarding_state = 'pin2',
                onboarding_data = $2
            WHERE phone = $1
          `,
          [phone, JSON.stringify({ pin_hash_temp: pinHash })]
        );

        return (
          `🔐 *PIN accepted and secured.*\n\n` +
          `Enter the *same PIN* again to confirm:`
        );
      }

      // ─────────────────────────────────────────────
      // PIN2
      // ─────────────────────────────────────────────
      case "pin2": {

        const pin = text.trim().replace(/\s/g, "");
        const savedRaw = client.onboarding_data;

        if (!validatePin(pin)) {
          return `❌ PIN must be exactly *6 digits*. Try again:`;
        }

        let savedData;

        try {
          savedData = JSON.parse(savedRaw || "{}");
        } catch {
          await txClient.query(
            `
              UPDATE clients
              SET onboarding_state = 'pin1',
                  onboarding_data = NULL
              WHERE phone = $1
            `,
            [phone]
          );

          return `⚠️ Session error. Please enter your PIN again:`;
        }

        const hashTemp = savedData.pin_hash_temp;

        if (!hashTemp) {
          await txClient.query(
            `
              UPDATE clients
              SET onboarding_state = 'pin1',
                  onboarding_data = NULL
              WHERE phone = $1
            `,
            [phone]
          );

          return `⚠️ Session expired. Please enter your PIN again:`;
        }

        let pinsMatch;

        try {
          pinsMatch = await bcrypt.compare(
            pin + (process.env.PIN_PEPPER || ""),
            hashTemp
          );
        } catch (err) {
          console.error(
            "SECURITY ERROR: bcrypt compare failed:",
            err.message
          );

          return (
            `🔴 *Security Error*\n\n` +
            `Could not verify your PIN.`
          );
        }

        if (!pinsMatch) {
          await txClient.query(
            `
              UPDATE clients
              SET onboarding_state = 'pin1',
                  onboarding_data = NULL
              WHERE phone = $1
            `,
            [phone]
          );

          return (
            `❌ *PINs do not match.*\n\n` +
            `Enter your *6-digit PIN* again:`
          );
        }

        await txClient.query(
          `
            UPDATE clients
            SET pin_hash = $2,
                onboarded = TRUE,
                onboarding_state = 'complete',
                onboarding_data = NULL,
                phone_verified = TRUE,
                status = CASE
                  WHEN status = 'pending'
                  THEN 'trial'
                  ELSE status
                END,
                updated_at = NOW()
            WHERE phone = $1
          `,
          [phone, hashTemp]
        );

        return buildCompleteMessage(client, lang);
      }

      default:
        return null;
    }
  });
}

// ─────────────────────────────────────────────────────────────
// WELCOME MESSAGE
// ─────────────────────────────────────────────────────────────
function getWelcomeMessage() {
  return (
    `🌟 *Welcome to ADE-LedgerFlow™* 🌟\n` +
    `_by Alpha-Aliph Automated Digital Enterprise_\n\n` +
    `📝 *Question 1 of 3*\n\n` +
    `What is your *full legal name*?\n\n` +
    `_Example: Adewale Okafor_`
  );
}

// ─────────────────────────────────────────────────────────────
// COMPLETE MESSAGE
// ─────────────────────────────────────────────────────────────
function buildCompleteMessage(client) {

  const plan =
    client.plan === "trial"
      ? "Free Trial"
      : client.plan || "Trial";

  const endDate = client.trial_ends_at
    ? new Date(client.trial_ends_at).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    `╔══════════════════════════════╗\n` +
    `║  ✅ SETUP COMPLETE! 🎉       ║\n` +
    `╚══════════════════════════════╝\n\n` +
    `👤 ${client.owner_name || "Welcome"}\n` +
    `🏪 ${client.business_name || "Your Business"}\n` +
    `📦 Plan: *${plan}*\n` +
    (endDate ? `📅 Trial ends: *${endDate}*\n` : "") +
    `🔐 PIN: *Secured* ✅\n\n` +
    `🚀 *Ready! Try your first command:*\n\n` +
    `_SALE 5000 RICE_\n` +
    `_EXPENSE 1200 FUEL_\n` +
    `_BAL_\n\n` +
    `Type *HELP* to see all commands 📖`
  );
}

// ─────────────────────────────────────────────────────────────
// CHECK ACTIVE FLOW
// ─────────────────────────────────────────────────────────────
async function isInOnboardingFlow(phone) {

  const client = await db.getOne(
    `
      SELECT onboarding_state, onboarded
      FROM clients
      WHERE phone = $1
    `,
    [phone]
  );

  if (!client) return false;
  if (client.onboarded) return false;

  const activeStates = [
    "awaiting_start",
    "name",
    "business",
    "pin1",
    "pin2",
  ];

  return activeStates.includes(client.onboarding_state);
}

// ─────────────────────────────────────────────────────────────
// CLEANUP STALE FLOWS
// ─────────────────────────────────────────────────────────────
async function cleanupStaleOnboarding() {

  try {

    const result = await db.query(
      `
        UPDATE clients
        SET onboarding_state = 'awaiting_start',
            onboarding_data = NULL
        WHERE onboarded = FALSE
          AND onboarding_state NOT IN ('awaiting_start', 'complete')
          AND updated_at < NOW() - INTERVAL '24 hours'
        RETURNING phone
      `
    );

    if (result.rowCount > 0) {
      console.log(
        `🧹 Cleared ${result.rowCount} stale onboarding session(s)`
      );
    }

  } catch (err) {

    console.error(
      "Onboarding cleanup failed:",
      err.message
    );
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN RESET
// ─────────────────────────────────────────────────────────────
async function resetOnboarding(phone) {

  await db.query(
    `
      UPDATE clients
      SET onboarding_state = 'pin1',
          onboarding_data = NULL,
          pin_hash = NULL,
          updated_at = NOW()
      WHERE phone = $1
    `,
    [phone]
  );

  console.log(`🔄 Onboarding reset for ${phone}`);
}

export {
  handleOnboarding,
  isInOnboardingFlow,
  cleanupStaleOnboarding,
  resetOnboarding,
  sanitizeName,
  sanitizeBusinessName,
};
