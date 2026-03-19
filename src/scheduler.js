const { cleanupStaleOnboarding } = require('./engines/onboardingEngine');
// ═══════════════════════════════════════════════════════════
// LedgerFlow — Scheduler
// File: src/scheduler.js
// FIXES: BUG 002 (URL bug) · BUG 007 (missing timezone on 2min cron)
// FIXES: BUG 008 (missing engine files crash) — all engines now exist
// FIXES: notifications table now uses `phone` directly (no users JOIN)
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const cron = require('node-cron');

// All imports are safe — all engine files now exist
const { runSubscriptionWarnings,
        expireOverdueSubscriptions } = require('./engines/subscriptionEngine');
const { runAutomatedDailyReports }   = require('./engines/reportEngine');
const { detectAgentFraud }           = require('./engines/securityEngine');

// DB is imported correctly — no URL construction here
// database.js reads DATABASE_URL / DB_HOST from .env automatically
const db = require('./config/database');

// ─────────────────────────────────────────────────────────────
// startScheduler — called once from server.js on startup
// ─────────────────────────────────────────────────────────────
function startScheduler() {
  console.log('⏰ LedgerFlow Scheduler starting...');

  // ── Daily Reports — 8:00 PM Lagos time
  cron.schedule('0 20 * * *', async () => {
    console.log('\n📊 [SCHEDULER] Running daily reports...');
    try {
      await runAutomatedDailyReports();
    } catch (err) {
      console.error('❌ Daily reports failed:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  // ── Subscription Warnings — 9:00 AM daily
  cron.schedule('0 9 * * *', async () => {
    console.log('\n⚠️  [SCHEDULER] Checking subscription warnings...');
    try {
      await runSubscriptionWarnings();
    } catch (err) {
      console.error('❌ Subscription warnings failed:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  // ── Expire Overdue Subscriptions — 12:01 AM daily
  cron.schedule('1 0 * * *', async () => {
    console.log('\n🔴 [SCHEDULER] Expiring overdue subscriptions...');
    try {
      await expireOverdueSubscriptions();
    } catch (err) {
      console.error('❌ Expiry job failed:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  // ── Send Pending WhatsApp Notifications — every 2 minutes
  // FIX BUG 007: timezone added
  cron.schedule('*/2 * * * *', async () => {
    try {
      await sendPendingNotifications();
    } catch (err) {
      console.error('❌ Notification dispatch failed:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  // ── Credit Reminders — 10:00 AM daily
  // Remind clients about debts older than 14 days
  cron.schedule('0 10 * * *', async () => {
    console.log('\n🔴 [SCHEDULER] Sending credit reminders...');
    try {
      await sendCreditReminders();
    } catch (err) {
      console.error('❌ Credit reminders failed:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  // ── Agent Fraud Checks — 11:00 PM daily
  cron.schedule('0 23 * * *', async () => {
    console.log('\n🕵️  [SCHEDULER] Running agent fraud checks...');
    try {
      const agents = await db.getMany(
        `SELECT agent_id FROM agents WHERE status = 'active'`, []
      );
      console.log(`   Checking ${agents.length} agents`);
      for (const agent of agents) {
        await detectAgentFraud(agent.agent_id);
      }
    } catch (err) {
      console.error('❌ Agent fraud check failed:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  // ── Weekly Reports — Every Sunday at 8:00 PM
  cron.schedule('0 20 * * 0', async () => {
    console.log('\n📅 [SCHEDULER] Running weekly reports...');
    try {
      await runWeeklyReports();
    } catch (err) {
      console.error('❌ Weekly reports failed:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  // ── Database Health Check — Every hour
  cron.schedule('0 * * * *', async () => {
    const ok = await db.testConnection();
    if (!ok) {
      console.error('🔴 [SCHEDULER] DB health check failed — check your connection');
    }
  });
  // Clear stale onboarding sessions — every hour
cron.schedule('0 * * * *', async () => {
  try { await cleanupStaleOnboarding(); }
  catch (err) { console.error('Onboarding cleanup failed:', err.message); }
}, { timezone: 'Africa/Lagos' });
```

---

### ORDER 5 — Set Owner PIN (2 minutes)

Open CMD in your project folder and run:
```
node scripts/setup-admin-pin.js
```

It will ask for your 6-digit PIN twice. Enter the same PIN both times. This replaces the `SET_VIA_DASHBOARD` placeholder with a real secure hash. You will use this PIN to log into the admin dashboard.

---

### ORDER 6 — Run `npm install` (2 minutes)
```
npm install
```

This ensures `bcrypt`, `googleapis`, and all dependencies are present. The new `onboardingEngine.js` will crash the server on startup if `bcrypt` is missing — that is intentional.

---

### ORDER 7 — Start Server and Link WhatsApp (5 minutes)
```
node src/server.js
```

You will see the database connect, then the pairing code banner:
```
╔═══════════════════════════════════════════════╗
║  📲 PHONE PAIRING CODE — ENTER IN WHATSAPP    ║
║                                                ║
║   CODE:  ABCD-1234                             ║
║                                                ║
║  ⚡ Code valid for ~60 seconds — enter NOW!    ║
╚═══════════════════════════════════════════════╝
```

**Immediately** on your personal phone:
1. Open WhatsApp
2. Tap ⋮ (three dots) → **Linked Devices** → **Link a Device**
3. At the bottom of the QR screen tap **"Link with phone number instead"**
4. Enter the **bot's SIM phone number**
5. WhatsApp asks for the code → enter the code from your terminal
6. Done. Terminal shows `✅ WHATSAPP CONNECTED SUCCESSFULLY!`

---

### ORDER 8 — Open Admin Dashboard (1 minute)

Double-click `admin-dashboard.html` to open it in your browser.

- **Server URL:** `http://localhost:3000`
- **Phone:** your admin phone number
- **PIN:** the 6-digit PIN you set in ORDER 5

You are now inside the dashboard. No curl commands. No terminal. Just click.

---

### ORDER 9 — Add Yourself as Test Client (2 minutes)

In the dashboard:
1. Click **Onboard Client** in the left sidebar
2. Enter your personal phone number (the one you will test from)
3. Enter business name: "Test Store"
4. Click **Onboard & Send Welcome**

Your personal phone receives a WhatsApp message from the bot.

---

### ORDER 10 — Complete Onboarding and Test (5 minutes)

On your personal phone, message the bot:
```
START
```

Follow the prompts — enter your name, business name, and create a 6-digit PIN.

Then test commands one by one:
```
SALE 5000 RICE
EXPENSE 1200 FUEL
S 3000 BREAD          ← alias shortcut
E 500 WATER           ← alias shortcut
BAL
REPORT
WEEK
CREDIT 7000 JOHN
CREDIT LIST
SUBSTATUS
HELP
```

Every one of these should get an instant reply. If any fails, the terminal shows the error.

---

## BRUTE-FORCE PROTECTION (the other AI's suggestion)

This is already half-built. Your `clients` table has a `failed_attempts` column and `locked_until` column from the original schema. The `securityEngine.js` has `checkLoginAttempts()` and `lockAccount()` functions. What needs adding is calling those functions when PIN verification fails during onboarding. That is a one-session task — do it after the bot is successfully linked and working.

---

## bcrypt on Windows vs Linux (the other AI's warning)

This is a real concern. `bcrypt` is a C++ native module. When you move from your Windows laptop to Render (Linux), you must run `npm install` fresh on the server — not upload your local `node_modules`. Render does this automatically when you deploy via GitHub. Your build command `npm install` handles it. Nothing extra needed.

---

## What Remains After These 10 Steps
```
✅ Bot linked and responding
✅ All 46 tables in Supabase
✅ Onboarding flow working securely
✅ Admin dashboard in browser
✅ All commands tested
✅ Security patches applied
✅ Owner PIN set properly

❌ Google Sheets (ORDER 11 — after everything above works)
❌ First 3 real clients found
❌ Marketing materials created
❌ Deploy to Render (when 10+ clients)

  console.log('✅ All scheduled jobs active:');
  console.log('   📊 Daily reports   → 8:00 PM  (Africa/Lagos)');
  console.log('   ⚠️  Sub warnings   → 9:00 AM  (Africa/Lagos)');
  console.log('   🔴 Credit remind   → 10:00 AM (Africa/Lagos)');
  console.log('   ❌ Sub expiry      → 12:01 AM (Africa/Lagos)');
  console.log('   📅 Weekly reports  → Sun 8PM  (Africa/Lagos)');
  console.log('   🕵️  Fraud checks   → 11:00 PM (Africa/Lagos)');
  console.log('   💬 Notifications   → every 2 min\n');
}

// ─────────────────────────────────────────────────────────────
// sendPendingNotifications
// FIX: Was joining `users` table that doesn't exist.
// Notifications table now stores `phone` directly — no JOIN needed.
// ─────────────────────────────────────────────────────────────
async function sendPendingNotifications() {
  const pending = await db.getMany(`
    SELECT * FROM notifications
    WHERE status = 'pending'
      AND channel = 'whatsapp'
      AND (scheduled_for IS NULL OR scheduled_for <= NOW())
    ORDER BY created_at
    LIMIT 20
  `, []);

  if (pending.length === 0) return;

  // Lazy-load WhatsApp client (avoids circular dependency)
  let sendWhatsAppMessage;
  try {
    ({ sendWhatsAppMessage } = require('./whatsapp/whatsappClient'));
  } catch (err) {
    console.error('❌ WhatsApp client not available:', err.message);
    return;
  }

  let sent = 0, failed = 0;

  for (const notification of pending) {
    try {
      await sendWhatsAppMessage(notification.phone, notification.message);

      await db.query(`
        UPDATE notifications
        SET status = 'sent', sent_at = NOW(), retry_count = retry_count
        WHERE notification_id = $1
      `, [notification.notification_id]);

      sent++;
    } catch (err) {
      console.error(`❌ Notification failed for ${notification.phone}:`, err.message);

      // After 3 failures, mark as permanently failed
      const newRetry = (notification.retry_count || 0) + 1;
      await db.query(`
        UPDATE notifications
        SET status = CASE WHEN $2 >= 3 THEN 'failed' ELSE 'pending' END,
            retry_count = $2
        WHERE notification_id = $1
      `, [notification.notification_id, newRetry]);

      failed++;
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(`💬 Notifications: ${sent} sent, ${failed} failed`);
  }
}

// ─────────────────────────────────────────────────────────────
// sendCreditReminders
// Reminds clients about old unpaid credit
// ─────────────────────────────────────────────────────────────
async function sendCreditReminders() {
  // Find clients with credits older than 14 days that haven't been reminded this week
  const staleCredits = await db.getMany(`
    SELECT
      c.id AS client_id, c.phone, c.business_name, c.currency_symbol,
      cr.debtor_name, cr.balance_owed, cr.created_at AS credit_date
    FROM credits cr
    JOIN clients c ON cr.client_id = c.id
    WHERE cr.status IN ('open','partial')
      AND cr.created_at < NOW() - INTERVAL '14 days'
      AND (cr.reminded_at IS NULL OR cr.reminded_at < NOW() - INTERVAL '7 days')
      AND c.status IN ('active','trial')
    ORDER BY cr.balance_owed DESC
    LIMIT 50
  `);

  for (const credit of staleCredits) {
    const daysOld = Math.floor((Date.now() - new Date(credit.credit_date)) / 86_400_000);
    const sym = credit.currency_symbol || '₦';

    const message =
      `🔴 *CREDIT REMINDER*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `*${credit.debtor_name}* owes you:\n` +
      `💰 *${sym}${parseFloat(credit.balance_owed).toLocaleString()}*\n` +
      `📅 Since ${daysOld} days ago\n\n` +
      `💡 Tip: Follow up today — old debts are harder to collect.\n\n` +
      `_To record a payment: PAYMENT ${Math.round(credit.balance_owed)} ${credit.debtor_name}_`;

    await db.query(`
      INSERT INTO notifications(client_id, phone, message, notification_type, status)
      VALUES($1,$2,$3,'credit_reminder','pending')
    `, [credit.client_id, credit.phone, message]);

    // Update reminded_at to avoid spamming
    await db.query(`
      UPDATE credits SET reminded_at = NOW()
      WHERE client_id = $1 AND debtor_name = $2 AND status IN ('open','partial')
    `, [credit.client_id, credit.debtor_name]);
  }

  if (staleCredits.length > 0) {
    console.log(`🔴 Credit reminders queued: ${staleCredits.length}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Weekly reports (Sunday 8PM)
// ─────────────────────────────────────────────────────────────
async function runWeeklyReports() {
  const clients = await db.getMany(`
    SELECT * FROM clients
    WHERE status IN ('active') AND plan IN ('PRO','SME')
  `);

  for (const client of clients) {
    const sym  = client.currency_symbol || '₦';
    const week = await db.getOne(`
      SELECT
        COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END), 0) AS sales,
        COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END), 0) AS expenses,
        COUNT(*) AS count,
        COUNT(DISTINCT DATE(created_at AT TIME ZONE 'Africa/Lagos')) AS active_days
      FROM transactions
      WHERE client_id=$1
        AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Africa/Lagos') - INTERVAL '7 days'
        AND created_at <  DATE_TRUNC('week', NOW() AT TIME ZONE 'Africa/Lagos')
    `, [client.id]);

    const profit = parseFloat(week.sales) - parseFloat(week.expenses);
    const sym2 = sym;

    const message =
      `📅 *WEEKLY BUSINESS REPORT*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      (client.business_name ? `🏪 ${client.business_name}\n\n` : '\n') +
      `*This Week's Numbers*\n` +
      `💰 Sales:      ${sym2}${parseFloat(week.sales).toLocaleString()}\n` +
      `💸 Expenses:   ${sym2}${parseFloat(week.expenses).toLocaleString()}\n` +
      `✨ Net Profit: ${sym2}${profit.toLocaleString()}\n` +
      `📝 Entries:    ${week.count}\n` +
      `📆 Active Days: ${week.active_days}/7\n\n` +
      `_Great week? Keep the momentum going._\n` +
      `_Slow week? Analyze your top sellers with TOP_\n\n` +
      `_LedgerFlow — Your business, tracked._`;

    await db.query(`
      INSERT INTO notifications(client_id, phone, message, notification_type, status)
      VALUES($1,$2,$3,'weekly_report','pending')
    `, [client.id, client.phone, message]);
  }
}

module.exports = { startScheduler };