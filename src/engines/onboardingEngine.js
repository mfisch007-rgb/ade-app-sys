// ═══════════════════════════════════════════════════════════
// Alpha-Aliph ADE-LedgerFlow™ — Client Onboarding Engine
// File: src/engines/onboardingEngine.js
//
// SECURITY FIXES:
//   FIX 1: PIN never stored in plaintext — hashed immediately in pin1
//   FIX 2: bcrypt failure = hard error, onboarding blocked (no null PIN)
//   FIX 3: Row-level lock prevents race condition on double-send
//   FIX 4: Stale onboarding data auto-cleared after 24 hours
//   FIX 5: Input sanitization on names (strips emojis, limits length)
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const db = require('../config/database');

// ─────────────────────────────────────────────────────────────
// BCRYPT — hard dependency, not optional
// ─────────────────────────────────────────────────────────────
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch {
  // If bcrypt is missing, fail loudly at startup — not silently during onboarding
  console.error('═══════════════════════════════════════════════════');
  console.error('FATAL: bcrypt is not installed.');
  console.error('Run: npm install bcrypt');
  console.error('ADE-LedgerFlow cannot onboard clients without bcrypt.');
  console.error('═══════════════════════════════════════════════════');
  process.exit(1);   // crash the server so you know immediately
}

// ─────────────────────────────────────────────────────────────
// INPUT SANITIZER
// Strips emojis, trims whitespace, enforces length limits
// Prevents Google Sheets sync failures and PDF generation crashes
// ─────────────────────────────────────────────────────────────
function sanitizeName(input) {
  if (!input) return '';

  return input
    .trim()
    // Remove emoji and non-printable Unicode ranges
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')   // emoji
    .replace(/[\u{2600}-\u{27BF}]/gu, '')      // misc symbols
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')      // variation selectors
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')    // more emoji
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);   // hard max length
}

function sanitizeBusinessName(input) {
  return sanitizeName(input)
    // Remove SQL-injection characters (belt + suspenders — parameterized queries already protect us)
    .replace(/[;'"\\]/g, '')
    .substring(0, 100);
}

function validatePin(pin) {
  if (!pin) return false;
  const clean = pin.trim().replace(/\s/g, '');
  return /^\d{6}$/.test(clean);
}

// ─────────────────────────────────────────────────────────────
// GET ONBOARDING STATE — with row-level lock
// FIX 3: SELECT FOR UPDATE prevents two simultaneous messages
//         from both seeing the same state and writing twice
// ─────────────────────────────────────────────────────────────
async function getOnboardingStateLocked(phone, dbClient) {
  // dbClient is a transaction client — ensures the lock holds until COMMIT
  const result = await dbClient.query(
    `SELECT id, phone, owner_name, business_name, onboarded,
            onboarding_state, onboarding_data, language, currency_symbol,
            created_at
     FROM clients WHERE phone=$1
     FOR UPDATE`,   // ← row-level lock: second message waits until first commits
    [phone]
  );
  return result.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────
// MAIN ONBOARDING HANDLER
// Wrapped in a DB transaction for race condition safety
// ─────────────────────────────────────────────────────────────
async function handleOnboarding(phone, text, langCode) {
  // Use a transaction so the row lock is held for the entire operation
  return db.transaction(async (txClient) => {
    const client = await getOnboardingStateLocked(phone, txClient);
    if (!client) return null;                     // not in system at all

    const state = client.onboarding_state || 'awaiting_start';
    const lang  = client.language || langCode || 'en';

    // Already fully onboarded — exit
    if (client.onboarded && state === 'complete') return null;

    // Check for stale session (started more than 24 hours ago and not complete)
    // FIX 4: Stale onboarding data cleared automatically
    const ageHours = (Date.now() - new Date(client.created_at).getTime()) / 3_600_000;
    if (ageHours > 24 && state !== 'awaiting_start' && state !== 'complete') {
      await txClient.query(
        `UPDATE clients SET onboarding_state='awaiting_start', onboarding_data=NULL WHERE phone=$1`,
        [phone]
      );
      return `⏰ *Session Expired*\n\n` +
        `Your setup session expired after 24 hours.\n` +
        `Type *START* to begin again.`;
    }

    const upper = text.trim().toUpperCase();

    switch (state) {

      // ── Waiting for START ────────────────────────────────
      case 'awaiting_start': {
        if (!upper.startsWith('START')) {
          return `👋 *Welcome to ADE-LedgerFlow™*\n\n` +
            `_by Alpha-Aliph Automated Digital Enterprise_\n\n` +
            `Your account is ready to activate.\n` +
            `Type *START* to begin setup ⬇️`;
        }

        await txClient.query(
          `UPDATE clients SET onboarding_state='name', language=$2 WHERE phone=$1`,
          [phone, lang]
        );
        return getWelcomeMessage(lang);
      }

      // ── Step 1: Full legal name ──────────────────────────
      case 'name': {
        const rawName = text.trim();
        const name    = sanitizeName(rawName);

        if (name.length < 2) {
          return `❌ Please enter your *full legal name*.\n\nExample: _Adewale Okafor_`;
        }

        await txClient.query(
          `UPDATE clients SET owner_name=$2, onboarding_state='business' WHERE phone=$1`,
          [phone, name]
        );

        return `✅ *Name saved:* ${name}\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📝 *Question 2 of 3*\n\n` +
          `What is your *business or store name*?\n\n` +
          `_Example: Okafor Electronics_`;
      }

      // ── Step 2: Business name ────────────────────────────
      case 'business': {
        const rawBiz = text.trim();
        const biz    = sanitizeBusinessName(rawBiz);

        if (biz.length < 2) {
          return `❌ Please enter your *business or store name*.\n\nExample: _Mama Titi Provisions_`;
        }

        await txClient.query(
          `UPDATE clients SET business_name=$2, onboarding_state='pin1', onboarding_data=NULL WHERE phone=$1`,
          [phone, biz]
        );

        return `✅ *Business saved:* ${biz}\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📝 *Question 3 of 3 — Security PIN*\n\n` +
          `🔐 Create your *6-digit PIN*\n\n` +
          `This PIN secures your account.\n` +
          `_Never share it with anyone — not even ADE staff._\n\n` +
          `Enter your 6-digit PIN now:`;
      }

      // ── Step 3: PIN entry (first) ────────────────────────
      // FIX 1: Hash PIN immediately — NEVER store plaintext
      case 'pin1': {
        const pin = text.trim().replace(/\s/g, '');

        if (!validatePin(pin)) {
          return `❌ PIN must be exactly *6 digits* (numbers only).\n\nExample: _123456_\n\nTry again:`;
        }

        // Hash immediately — plaintext PIN is gone after this line
        let pinHash;
        try {
          pinHash = await bcrypt.hash(pin + (process.env.PIN_PEPPER || ''), 12);
        } catch (err) {
          // FIX 2: Hard failure — never allow null PIN
          console.error('SECURITY ERROR: bcrypt hash failed during onboarding:', err.message);
          return `🔴 *Security Error*\n\nCould not secure your PIN due to a server issue.\n` +
            `Please try again in a moment. If this repeats, contact admin.`;
          // Transaction will rollback — no state change committed
        }

        // Store the HASH, not the PIN
        // onboarding_data stores only the hash (not reversible to plaintext)
        await txClient.query(
          `UPDATE clients SET onboarding_state='pin2', onboarding_data=$2 WHERE phone=$1`,
          [phone, JSON.stringify({ pin_hash_temp: pinHash })]
        );

        return `🔐 *PIN accepted and secured.*\n\n` +
          `Enter the *same PIN* again to confirm:`;
      }

      // ── Step 4: PIN confirmation ─────────────────────────
      // FIX 1: Compare attempt against stored hash using bcrypt.compare
      case 'pin2': {
        const pin      = text.trim().replace(/\s/g, '');
        const savedRaw = client.onboarding_data;

        if (!validatePin(pin)) {
          return `❌ PIN must be exactly *6 digits*. Try again:`;
        }

        // Parse saved hash
        let savedData;
        try {
          savedData = JSON.parse(savedRaw || '{}');
        } catch {
          // Corrupted state — restart
          await txClient.query(
            `UPDATE clients SET onboarding_state='pin1', onboarding_data=NULL WHERE phone=$1`,
            [phone]
          );
          return `⚠️ *Session error.* Please enter your PIN again:`;
        }

        const hashTemp = savedData.pin_hash_temp;
        if (!hashTemp) {
          // No hash found — restart pin entry
          await txClient.query(
            `UPDATE clients SET onboarding_state='pin1', onboarding_data=NULL WHERE phone=$1`,
            [phone]
          );
          return `⚠️ *Session expired.* Please enter your 6-digit PIN again:`;
        }

        // Compare entered PIN against the stored hash
        let pinsMatch;
        try {
          pinsMatch = await bcrypt.compare(pin + (process.env.PIN_PEPPER || ''), hashTemp);
        } catch (err) {
          // FIX 2: Hard failure on compare as well
          console.error('SECURITY ERROR: bcrypt compare failed:', err.message);
          return `🔴 *Security Error*\n\nCould not verify your PIN. Please try again.`;
        }

        if (!pinsMatch) {
          // PINs don't match — go back to pin1, clear temp hash
          await txClient.query(
            `UPDATE clients SET onboarding_state='pin1', onboarding_data=NULL WHERE phone=$1`,
            [phone]
          );
          return `❌ *PINs do not match.*\n\nLet's try again. Enter your *6-digit PIN*:`;
        }

        // PINs match — finalize onboarding
        // Move hash from temp storage to permanent pin_hash column
        // Clear onboarding_data completely (no residual data)
        await txClient.query(`
          UPDATE clients SET
            pin_hash         = $2,
            onboarded        = TRUE,
            onboarding_state = 'complete',
            onboarding_data  = NULL,
            phone_verified   = TRUE,
            status           = CASE WHEN status='pending' THEN 'trial' ELSE status END,
            updated_at       = NOW()
          WHERE phone = $1
        `, [phone, hashTemp]);

        // Return completion message
        return buildCompleteMessage(client, lang);
      }

      default:
        return null;
    }
  });
}

// ─────────────────────────────────────────────────────────────
// WELCOME MESSAGE (shown after START)
// ─────────────────────────────────────────────────────────────
function getWelcomeMessage(lang) {
  return `🌟 *Welcome to ADE-LedgerFlow™* 🌟\n` +
    `_by Alpha-Aliph Automated Digital Enterprise_\n\n` +
    `╔══════════════════════════════╗\n` +
    `║  🚀 YOUR ACCOUNT IS READY   ║\n` +
    `╚══════════════════════════════╝\n\n` +
    `At *ADE*, we help your business:\n` +
    `📈 *Grow faster* with real-time tracking\n` +
    `⚡ *Work smarter* — reduce manual work\n` +
    `🔍 *Detect fraud* before it costs you\n` +
    `📊 *Scale up* — while the system runs the books\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Setup takes *less than 2 minutes*.\n` +
    `Please answer honestly — your data is secured.\n\n` +
    `🔒 _Only authorized ADE admins can view your information._\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 *Question 1 of 3*\n\n` +
    `What is your *full legal name*?\n\n` +
    `_Example: Adewale Okafor_`;
}

// ─────────────────────────────────────────────────────────────
// COMPLETION MESSAGE
// ─────────────────────────────────────────────────────────────
function buildCompleteMessage(client, lang) {
  const plan    = client.plan === 'trial' ? 'Free Trial' : client.plan;
  const sym     = client.currency_symbol || '₦';
  const endDate = client.trial_ends_at
    ? new Date(client.trial_ends_at).toLocaleDateString('en-NG', {day:'numeric',month:'long',year:'numeric'})
    : '';

  return `╔══════════════════════════════╗\n` +
    `║  ✅ SETUP COMPLETE! 🎉       ║\n` +
    `╚══════════════════════════════╝\n\n` +
    `👤 ${client.owner_name || 'Welcome'}\n` +
    `🏪 ${client.business_name || 'Your Business'}\n` +
    `📦 Plan: *${plan}*\n` +
    (endDate ? `📅 Trial ends: *${endDate}*\n` : '') +
    `🔐 PIN: *Secured* ✅\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 *Ready! Try your first command:*\n\n` +
    `_SALE 5000 RICE_\n` +
    `_EXPENSE 1200 FUEL_\n` +
    `_BAL_\n\n` +
    `Type *HELP* to see all commands 📖\n\n` +
    `_ADE-LedgerFlow™ — Your business, tracked._ 🌟\n` +
    `_© Alpha-Aliph Automated Digital Enterprise_`;
}

// ─────────────────────────────────────────────────────────────
// CHECK if phone is in onboarding flow
// ─────────────────────────────────────────────────────────────
async function isInOnboardingFlow(phone) {
  const client = await db.getOne(
    `SELECT onboarding_state, onboarded FROM clients WHERE phone=$1`,
    [phone]
  );
  if (!client) return false;
  if (client.onboarded) return false;
  const activeStates = ['awaiting_start','name','business','pin1','pin2'];
  return activeStates.includes(client.onboarding_state);
}

// ─────────────────────────────────────────────────────────────
// SCHEDULED CLEANUP — call from scheduler.js every hour
// FIX 4: Clear stale onboarding data older than 24 hours
// ─────────────────────────────────────────────────────────────
async function cleanupStaleOnboarding() {
  try {
    const result = await db.query(`
      UPDATE clients
      SET onboarding_state = 'awaiting_start',
          onboarding_data  = NULL
      WHERE onboarded = FALSE
        AND onboarding_state NOT IN ('awaiting_start','complete')
        AND updated_at < NOW() - INTERVAL '24 hours'
      RETURNING phone
    `);
    if (result.rowCount > 0) {
      console.log(`🧹 Cleared ${result.rowCount} stale onboarding session(s)`);
    }
  } catch (err) {
    console.error('Onboarding cleanup failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN UTILITY: reset a client back to onboarding start
// (in case they are locked out of their PIN)
// ─────────────────────────────────────────────────────────────
async function resetOnboarding(phone) {
  await db.query(`
    UPDATE clients
    SET onboarding_state = 'pin1',
        onboarding_data  = NULL,
        pin_hash         = NULL,
        updated_at       = NOW()
    WHERE phone = $1
  `, [phone]);
  console.log(`🔄 Onboarding reset for ${phone}`);
}

module.exports = {
  handleOnboarding,
  isInOnboardingFlow,
  cleanupStaleOnboarding,
  resetOnboarding,
  sanitizeName,
  sanitizeBusinessName,
};