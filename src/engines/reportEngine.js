// ═══════════════════════════════════════════════════════════
// LedgerFlow — Report Engine
// File: src/engines/reportEngine.js
// Generates and sends daily/weekly WhatsApp reports at 8PM
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const db = require('../config/database');

const MOTIVATIONAL_QUOTES = [
  '"Every naira you track is a naira you control." — LedgerFlow',
  '"You can\'t grow what you don\'t measure." — Peter Drucker',
  '"Revenue is vanity, profit is sanity, cash is reality." — Unknown',
  '"Small businesses don\'t fail for lack of talent — they fail for lack of cash visibility." — LedgerFlow',
  '"Your books tell the story of your business. Make it a good one." — LedgerFlow',
  '"Track today or regret tomorrow." — LedgerFlow',
  '"The goal of a business is to make profit, not just revenue. Know the difference." — LedgerFlow',
];

function getMotivationalQuote() {
  const d = Math.floor(Date.now() / 86_400_000);
  return MOTIVATIONAL_QUOTES[d % MOTIVATIONAL_QUOTES.length];
}

function fmt(amount, sym = '₦') {
  return `${sym}${parseFloat(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
}

function gradeProfit(margin) {
  if (margin >= 50) return { grade: 'A+', label: 'Outstanding', emoji: '🏆' };
  if (margin >= 40) return { grade: 'A',  label: 'Excellent',   emoji: '🌟' };
  if (margin >= 30) return { grade: 'B',  label: 'Good',        emoji: '✅' };
  if (margin >= 20) return { grade: 'C',  label: 'Moderate',    emoji: '⚡' };
  if (margin >= 5)  return { grade: 'D',  label: 'Low',         emoji: '⚠️' };
  return                   { grade: 'F',  label: 'Critical',    emoji: '🔴' };
}

// ─────────────────────────────────────────────────────────────
// Generate daily report text for one client
// ─────────────────────────────────────────────────────────────
async function generateDailyReportText(client) {
  const sym = client.currency_symbol || '₦';

  // Today's stats
  const today = await db.getOne(`
    SELECT
      COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END), 0) AS sales,
      COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END), 0) AS expenses,
      COALESCE(SUM(CASE WHEN type='CREDIT'  THEN amount END), 0) AS credit,
      COUNT(*)                                                     AS count
    FROM transactions
    WHERE client_id=$1
      AND DATE(created_at AT TIME ZONE 'Africa/Lagos') = CURRENT_DATE
  `, [client.id]);

  // This month
  const month = await db.getOne(`
    SELECT
      COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END), 0) AS sales,
      COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END), 0) AS expenses
    FROM transactions
    WHERE client_id=$1
      AND DATE_TRUNC('month', created_at AT TIME ZONE 'Africa/Lagos')
          = DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Lagos')
  `, [client.id]);

  // Open credits
  const credits = await db.getOne(
    `SELECT COUNT(*) AS count, COALESCE(SUM(balance_owed),0) AS total
     FROM credits WHERE client_id=$1 AND status IN ('open','partial')`,
    [client.id]
  );

  // Streak
  const streakRows = await db.getMany(`
    SELECT DISTINCT DATE(created_at AT TIME ZONE 'Africa/Lagos') AS d
    FROM transactions WHERE client_id=$1 ORDER BY d DESC LIMIT 30
  `, [client.id]);

  let streak = 0;
  for (let i = 0; i < streakRows.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const actual = new Date(streakRows[i].d);
    if (actual.toDateString() === expected.toDateString()) streak++;
    else break;
  }

  const profit      = parseFloat(today.sales) - parseFloat(today.expenses);
  const monthProfit = parseFloat(month.sales)  - parseFloat(month.expenses);
  const margin      = today.sales > 0 ? Math.round((profit / today.sales) * 100) : 0;
  const { grade, label, emoji } = gradeProfit(margin);
  const dateStr = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Africa/Lagos'
  });

  if (parseInt(today.count) === 0) {
    return `📊 *DAILY REPORT — ${dateStr}*\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           (client.business_name ? `🏪 ${client.business_name}\n\n` : '\n') +
           `⚠️ *No transactions recorded today*\n\n` +
           `Your books weren't updated. Start tomorrow with:\n` +
           `SALE 5000 RICE\n\n` +
           `💡 _Businesses that track daily grow 3x faster._\n\n` +
           `_${getMotivationalQuote()}_`;
  }

  let msg = `📊 *DAILY BUSINESS REPORT*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (client.business_name) msg += `🏪 *${client.business_name}*\n`;
  msg += `📅 ${dateStr}\n\n`;

  msg += `*TODAY'S PERFORMANCE*\n`;
  msg += `💰 Sales:      ${fmt(today.sales, sym)} (${today.count} entries)\n`;
  msg += `💸 Expenses:   ${fmt(today.expenses, sym)}\n`;
  msg += `✨ Net Profit: ${fmt(profit, sym)}\n`;
  msg += `📊 Margin:     ${margin}%\n`;
  msg += `🏅 Grade: *${grade} — ${label}* ${emoji}\n\n`;

  msg += `*THIS MONTH TOTAL*\n`;
  msg += `💰 Sales:   ${fmt(month.sales, sym)}\n`;
  msg += `💸 Expenses: ${fmt(month.expenses, sym)}\n`;
  msg += `✨ Profit:  ${fmt(monthProfit, sym)}\n`;

  if (parseFloat(credits.total) > 0) {
    msg += `\n*CREDIT RADAR* 🔴\n`;
    msg += `${credits.count} ${credits.count == 1 ? 'person owes' : 'people owe'} you: *${fmt(credits.total, sym)}*\n`;
    msg += `_Type CREDIT LIST to see who_\n`;
  }

  if (streak >= 2) {
    msg += `\n🔥 *${streak}-Day Recording Streak!*\n`;
    if (streak >= 7)  msg += `_A full week — you're building something real!_\n`;
    if (streak >= 30) msg += `_30 DAYS! You are an elite business owner!_\n`;
  }

  msg += `\n_${getMotivationalQuote()}_\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_LedgerFlow — Your business, tracked._`;

  return msg;
}

// ─────────────────────────────────────────────────────────────
// Run automated daily reports for ALL active clients
// Called by scheduler at 8PM Lagos time
// ─────────────────────────────────────────────────────────────
async function runAutomatedDailyReports() {
  console.log('📊 Starting daily reports...');

  const clients = await db.getMany(`
    SELECT * FROM clients
    WHERE status IN ('active','trial')
      AND trial_ends_at > NOW() OR status = 'active'
    ORDER BY created_at
  `);

  console.log(`   Found ${clients.length} active clients`);

  let sent = 0, failed = 0;

  for (const client of clients) {
    try {
      const message = await generateDailyReportText(client);

      // Queue notification
      await db.query(`
        INSERT INTO notifications(client_id, phone, message, notification_type, status)
        VALUES ($1,$2,$3,'daily_report','pending')
      `, [client.id, client.phone, message]);

      // Store in summaries
      const today = await db.getOne(`
        SELECT
          COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END), 0) AS s,
          COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END), 0) AS e,
          COALESCE(SUM(CASE WHEN type='CREDIT'  THEN amount END), 0) AS c,
          COUNT(*) AS cnt
        FROM transactions
        WHERE client_id=$1 AND DATE(created_at AT TIME ZONE 'Africa/Lagos') = CURRENT_DATE
      `, [client.id]);

      await db.query(`
        INSERT INTO summaries(client_id, phone, summary_date, summary_type,
          total_sales, total_expenses, net_profit, total_credit, transaction_count)
        VALUES($1,$2,CURRENT_DATE,'daily',$3,$4,$5,$6,$7)
        ON CONFLICT(client_id, summary_date, summary_type) DO UPDATE SET
          total_sales=EXCLUDED.total_sales, total_expenses=EXCLUDED.total_expenses,
          net_profit=EXCLUDED.net_profit, sent_at=NOW()
      `, [client.id, client.phone, today.s, today.e, today.s - today.e, today.c, today.cnt]);

      sent++;
    } catch (err) {
      console.error(`❌ Report failed for ${client.phone}:`, err.message);
      failed++;
    }
  }

  console.log(`✅ Daily reports: ${sent} queued, ${failed} failed`);
}

module.exports = { runAutomatedDailyReports, generateDailyReportText };
