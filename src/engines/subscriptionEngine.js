// ═══════════════════════════════════════════════════════════
// LedgerFlow — Subscription Engine (FINAL MERGED VERSION)
// File: src/engines/subscriptionEngine.js
//
// FIXES:
//   FATAL-10: verifySubscription() restored
//   FATAL-11: checkModuleAccess() restored
//   FATAL-12: getSubscriptionStatus() restored
//   MERGED:   activateSubscription adapted for new clients table
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const db = require('../config/database');

const PRICING = {
  trial: { amount: 0,     label: 'Trial',  daysLeft: null },
  MICRO: { amount: 5000,  label: 'Micro',  features: ['SALE','EXPENSE','CAPITAL','BAL','BALANCE','REPORT','HELP','HISTORY','TOP','START','SUBSTATUS','CONTACT'] },
  PRO:   { amount: 10000, label: 'Pro',    features: ['MICRO_ALL','STOCK','CREDIT','PAYMENT','WEEK','CREDIT_LIST'] },
  SME:   { amount: 25000, label: 'SME',    features: ['PRO_ALL','DRUGSTOCK','DRUGSALE','CONTRIB','TRANSFER','WITHDRAW','MONTH'] },
};

// Commands available to each plan (inclusive — PRO gets MICRO commands too)
const PLAN_COMMANDS = {
  trial: ['SALE','EXPENSE','CAPITAL','BAL','BALANCE','REPORT','HELP','HISTORY','START','SUBSTATUS','CONTACT'],
  MICRO: ['SALE','EXPENSE','CAPITAL','BAL','BALANCE','REPORT','HELP','HISTORY','TOP','START','SUBSTATUS','CONTACT'],
  PRO:   ['SALE','EXPENSE','CAPITAL','BAL','BALANCE','REPORT','HELP','HISTORY','TOP','START','SUBSTATUS','CONTACT',
          'STOCK','CREDIT','PAYMENT','WEEK','CREDIT_LIST'],
  SME:   ['ALL'],   // ALL = unrestricted
};

// ─────────────────────────────────────────────────────────────
// VERIFY SUBSCRIPTION — is this client allowed to use the service?
// FATAL-10 FIX: was missing from new subscriptionEngine
// ─────────────────────────────────────────────────────────────
async function verifySubscription(phone) {
  const client = await db.getOne(`SELECT * FROM clients WHERE phone=$1`, [phone]);

  if (!client) {
    return { allowed: false, message: noSubscriptionMessage() };
  }

  if (client.status === 'active') {
    if (client.subscription_expires_at && new Date() > new Date(client.subscription_expires_at)) {
      // Expired — update status
      await db.query(`UPDATE clients SET status='expired', updated_at=NOW() WHERE id=$1`, [client.id]);
      return { allowed: false, message: expiredMessage() };
    }
    return { allowed: true, client };
  }

  if (client.status === 'trial') {
    if (client.trial_ends_at && new Date() > new Date(client.trial_ends_at)) {
      await db.query(`UPDATE clients SET status='expired', updated_at=NOW() WHERE id=$1`, [client.id]);
      return { allowed: false, message: trialExpiredMessage() };
    }
    return { allowed: true, client, onTrial: true };
  }

  if (client.status === 'suspended') {
    return { allowed: false, message: suspendedMessage() };
  }

  return { allowed: false, message: expiredMessage() };
}

// ─────────────────────────────────────────────────────────────
// CHECK MODULE ACCESS — can this client use this command?
// FATAL-11 FIX: was missing from new subscriptionEngine
// Prevents MICRO clients from using PRO features for free
// ─────────────────────────────────────────────────────────────
async function checkModuleAccess(phone, command) {
  const subResult = await verifySubscription(phone);
  if (!subResult.allowed) return subResult;

  const plan     = subResult.client.plan || 'trial';
  const allowed  = PLAN_COMMANDS[plan] || PLAN_COMMANDS.trial;

  if (allowed.includes('ALL')) return { allowed: true, client: subResult.client };
  if (allowed.includes(command.toUpperCase())) return { allowed: true, client: subResult.client };

  // Check if it's a MICRO_ALL or PRO_ALL catch-all
  if (plan === 'PRO') {
    const microCommands = PLAN_COMMANDS.MICRO;
    if (microCommands.includes(command.toUpperCase())) return { allowed: true, client: subResult.client };
  }
  if (plan === 'SME') {
    return { allowed: true, client: subResult.client }; // SME = ALL
  }

  const planRequired = getPlanRequiredFor(command);
  return {
    allowed: false,
    client:  subResult.client,
    message: `⚠️ *Feature not available on your plan*\n\n` +
             `Command: *${command}*\n` +
             `Your Plan: *${PRICING[plan]?.label || plan}*\n` +
             `Required: *${planRequired}*\n\n` +
             `Upgrade to unlock this feature.\n` +
             `Contact: ${process.env.ADMIN_PHONE || 'admin'} to upgrade.`,
  };
}

function getPlanRequiredFor(command) {
  const cmd = command.toUpperCase();
  if (PLAN_COMMANDS.MICRO.includes(cmd)) return 'Micro (₦5,000/month)';
  if (PLAN_COMMANDS.PRO.includes(cmd))  return 'Pro (₦10,000/month)';
  return 'SME (₦25,000/month)';
}

// ─────────────────────────────────────────────────────────────
// GET SUBSCRIPTION STATUS — for SUBSTATUS command
// FATAL-12 FIX: was missing from new subscriptionEngine
// ─────────────────────────────────────────────────────────────
async function getSubscriptionStatus(phone) {
  const client = await db.getOne(`SELECT * FROM clients WHERE phone=$1`, [phone]);

  if (!client) return noSubscriptionMessage();

  const plan = PRICING[client.plan] || PRICING.trial;
  let daysLeft = null;

  if (client.status === 'trial' && client.trial_ends_at) {
    daysLeft = Math.max(0, Math.ceil((new Date(client.trial_ends_at) - Date.now()) / 86_400_000));
  } else if (client.subscription_expires_at) {
    daysLeft = Math.max(0, Math.ceil((new Date(client.subscription_expires_at) - Date.now()) / 86_400_000));
  }

  const sym = client.currency_symbol || '₦';

  let msg = `📋 *SUBSCRIPTION STATUS*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (client.business_name) msg += `🏪 ${client.business_name}\n\n`;

  msg += `📦 Plan:    *${plan.label}*\n`;
  msg += `📊 Status:  *${client.status.toUpperCase()}*\n`;

  if (client.status === 'trial') {
    msg += `⏰ Trial ends in: *${daysLeft} day${daysLeft !== 1 ? 's' : ''}*\n`;
  } else if (daysLeft !== null) {
    msg += `📅 Renews in: *${daysLeft} day${daysLeft !== 1 ? 's' : ''}*\n`;
    if (daysLeft <= 3) msg += `⚠️ _Renewal soon — contact admin_\n`;
  }

  if (plan.amount > 0) {
    msg += `💰 Plan Cost: *${sym}${plan.amount.toLocaleString()}/month*\n`;
  }

  msg += `\n📞 To upgrade/renew: ${process.env.ADMIN_PHONE || 'contact admin'}\n`;
  msg += `_Type HELP to see available commands_`;

  return msg;
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIPTION WARNINGS (scheduler job — 9AM daily)
// ─────────────────────────────────────────────────────────────
async function runSubscriptionWarnings() {
  const warnDays = [
    parseInt(process.env.WARN_DAYS_FIRST)  || 8,
    parseInt(process.env.WARN_DAYS_SECOND) || 3,
    parseInt(process.env.WARN_DAYS_FINAL)  || 1,
  ];

  for (const days of warnDays) {
    const clients = await db.getMany(`
      SELECT * FROM clients
      WHERE status = 'active'
        AND subscription_expires_at::date = (CURRENT_DATE + INTERVAL '${days} days')::date
    `);

    for (const client of clients) {
      const plan = PRICING[client.plan] || PRICING.MICRO;
      const sym  = client.currency_symbol || '₦';
      const urgency = days === 1 ? '🚨 FINAL NOTICE' : days <= 3 ? '⚠️ REMINDER' : '📅 HEADS UP';

      const message =
        `${urgency} — Subscription Expiring\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        (client.business_name ? `🏪 ${client.business_name}\n\n` : '\n') +
        `Your *LedgerFlow ${plan.label}* expires in *${days} day${days > 1 ? 's' : ''}*.\n\n` +
        `To renew: *${sym}${plan.amount.toLocaleString()}*\n` +
        `📞 ${process.env.ADMIN_PHONE}\n\n` +
        `⚠️ _Service pauses on expiry. Renew early!_`;

      await queueNotification(client, message, 'subscription_warning');
    }

    // Trial warnings (3 days before trial ends)
    if (days === 3) {
      const trials = await db.getMany(`
        SELECT * FROM clients
        WHERE status='trial'
          AND trial_ends_at::date = (CURRENT_DATE + INTERVAL '3 days')::date
      `);

      for (const client of trials) {
        const message =
          `⏰ *Trial Ending in 3 Days*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          (client.business_name ? `🏪 ${client.business_name}\n\n` : '\n') +
          `Your free trial ends in 3 days.\n\n` +
          `*Choose your plan:*\n` +
          `🔵 Micro: ₦5,000/month\n` +
          `🟣 Pro:   ₦10,000/month\n` +
          `⭐ SME:   ₦25,000/month\n\n` +
          `📞 ${process.env.ADMIN_PHONE}`;

        await queueNotification(client, message, 'trial_warning');
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPIRE OVERDUE SUBSCRIPTIONS (scheduler job — 12:01AM)
// ─────────────────────────────────────────────────────────────
async function expireOverdueSubscriptions() {
  const expired = await db.getMany(`
    UPDATE clients SET status='expired', updated_at=NOW()
    WHERE status='active' AND subscription_expires_at < NOW()
    RETURNING *
  `);

  for (const client of expired) {
    await queueNotification(client, expiredMessage(client.business_name), 'subscription_expired');
    console.log(`❌ Subscription expired: ${client.phone}`);
  }

  const expiredTrials = await db.getMany(`
    UPDATE clients SET status='expired', updated_at=NOW()
    WHERE status='trial' AND trial_ends_at < NOW()
    RETURNING *
  `);

  for (const client of expiredTrials) {
    const message =
      `⏰ *Free Trial Ended*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      (client.business_name ? `🏪 ${client.business_name}\n\n` : '\n') +
      `Your 14-day trial has ended.\n\n` +
      `Subscribe to continue:\n` +
      `🔵 Micro: ₦5,000/month\n` +
      `🟣 Pro:   ₦10,000/month\n` +
      `⭐ SME:   ₦25,000/month\n\n` +
      `📞 ${process.env.ADMIN_PHONE}\n` +
      `_Your data is safe — 90 day retention._`;

    await queueNotification(client, message, 'trial_expired');
    console.log(`⏰ Trial expired: ${client.phone}`);
  }
}

// ─────────────────────────────────────────────────────────────
// ACTIVATE SUBSCRIPTION (called by admin)
// ─────────────────────────────────────────────────────────────
async function activateSubscription(phone, plan = 'MICRO', months = 1) {
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + months);

  const client = await db.getOne(`
    UPDATE clients
    SET status='active',
        plan=$2,
        subscription_expires_at=$3,
        subscription_started_at=COALESCE(subscription_started_at,NOW()),
        updated_at=NOW()
    WHERE phone=$1
    RETURNING *
  `, [phone, plan, expiry]);

  if (!client) throw new Error(`Client not found: ${phone}`);

  const planInfo = PRICING[plan] || PRICING.MICRO;
  const sym      = client.currency_symbol || '₦';

  const message =
    `✅ *LedgerFlow Activated!*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    (client.business_name ? `🏪 ${client.business_name}\n\n` : '\n') +
    `Plan: *${planInfo.label}*\n` +
    `Cost: *${sym}${planInfo.amount.toLocaleString()}/month*\n` +
    `Expires: *${expiry.toLocaleDateString('en-NG')}*\n\n` +
    `Ready! Try:\n` +
    `_SALE 5000 RICE_\n` +
    `_EXPENSE 1200 FUEL_\n` +
    `_BAL_\n\n` +
    `Type *HELP* for all commands 📖\n` +
    `_Welcome to LedgerFlow! 🚀_`;

  await queueNotification(client, message, 'subscription_activated');
  return client;
}

// ─────────────────────────────────────────────────────────────
// QUEUE NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────
async function queueNotification(client, message, type = 'general') {
  await db.query(
    `INSERT INTO notifications(client_id, phone, message, notification_type, status)
     VALUES($1,$2,$3,$4,'pending')`,
    [client.id || null, client.phone, message, type]
  );
}

// ─────────────────────────────────────────────────────────────
// MESSAGE TEMPLATES
// ─────────────────────────────────────────────────────────────
function noSubscriptionMessage() {
  return `❌ *Account Not Registered*\n\nYour number isn't in our system.\nContact: ${process.env.ADMIN_PHONE || 'admin'} to activate.`;
}

function expiredMessage(businessName = '') {
  return `❌ *Subscription Expired*\n\n${businessName ? businessName + ' — ' : ''}Service access paused.\n\nRenew now: ${process.env.ADMIN_PHONE || 'admin'}`;
}

function trialExpiredMessage() {
  return `⏰ *Trial Ended*\n\nYour free trial is over.\n\nSubscribe to continue:\n🔵 ₦5,000/month — Micro\n🟣 ₦10,000/month — Pro\n⭐ ₦25,000/month — SME\n\n📞 ${process.env.ADMIN_PHONE || 'admin'}`;
}

function suspendedMessage() {
  return `⚠️ *Account Suspended*\n\nContact admin: ${process.env.ADMIN_PHONE || 'admin'}`;
}

module.exports = {
  verifySubscription,
  checkModuleAccess,
  getSubscriptionStatus,
  runSubscriptionWarnings,
  expireOverdueSubscriptions,
  activateSubscription,
  queueNotification,
  PRICING,
  PLAN_COMMANDS,
};
