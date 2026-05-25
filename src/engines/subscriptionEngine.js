// ═══════════════════════════════════════════════════════════
// LedgerFlow — Subscription Engine (ESM VERSION)
// File: src/engines/subscriptionEngine.js
// ═══════════════════════════════════════════════════════════

import dotenv from 'dotenv';
dotenv.config();

import db from '../config/database.js';

/* ─────────────────────────────────────────────────────────────
   PRICING
───────────────────────────────────────────────────────────── */

export const PRICING = {
  trial: {
    amount: 0,
    label: 'Trial',
    daysLeft: null
  },

  MICRO: {
    amount: 5000,
    label: 'Micro',
    features: [
      'SALE','EXPENSE','CAPITAL','BAL',
      'BALANCE','REPORT','HELP','HISTORY',
      'TOP','START','SUBSTATUS','CONTACT'
    ]
  },

  PRO: {
    amount: 10000,
    label: 'Pro',
    features: [
      'MICRO_ALL','STOCK','CREDIT',
      'PAYMENT','WEEK','CREDIT_LIST'
    ]
  },

  SME: {
    amount: 25000,
    label: 'SME',
    features: [
      'PRO_ALL','DRUGSTOCK','DRUGSALE',
      'CONTRIB','TRANSFER','WITHDRAW',
      'MONTH'
    ]
  }
};

/* ─────────────────────────────────────────────────────────────
   PLAN COMMANDS
───────────────────────────────────────────────────────────── */

export const PLAN_COMMANDS = {

  trial: [
    'SALE','EXPENSE','CAPITAL','BAL',
    'BALANCE','REPORT','HELP','HISTORY',
    'START','SUBSTATUS','CONTACT'
  ],

  MICRO: [
    'SALE','EXPENSE','CAPITAL','BAL',
    'BALANCE','REPORT','HELP','HISTORY',
    'TOP','START','SUBSTATUS','CONTACT'
  ],

  PRO: [
    'SALE','EXPENSE','CAPITAL','BAL',
    'BALANCE','REPORT','HELP','HISTORY',
    'TOP','START','SUBSTATUS','CONTACT',
    'STOCK','CREDIT','PAYMENT',
    'WEEK','CREDIT_LIST'
  ],

  SME: ['ALL']
};

/* ─────────────────────────────────────────────────────────────
   VERIFY SUBSCRIPTION
───────────────────────────────────────────────────────────── */

export async function verifySubscription(phone) {

  const client = await db.getOne(
    `SELECT * FROM clients WHERE phone=$1`,
    [phone]
  );

  if (!client) {
    return {
      allowed: false,
      message: noSubscriptionMessage()
    };
  }

  if (client.status === 'active') {

    if (
      client.subscription_expires_at &&
      new Date() > new Date(client.subscription_expires_at)
    ) {

      await db.query(`
        UPDATE clients
        SET status='expired',
            updated_at=NOW()
        WHERE id=$1
      `,[client.id]);

      return {
        allowed: false,
        message: expiredMessage()
      };
    }

    return {
      allowed: true,
      client
    };
  }

  if (client.status === 'trial') {

    if (
      client.trial_ends_at &&
      new Date() > new Date(client.trial_ends_at)
    ) {

      await db.query(`
        UPDATE clients
        SET status='expired',
            updated_at=NOW()
        WHERE id=$1
      `,[client.id]);

      return {
        allowed: false,
        message: trialExpiredMessage()
      };
    }

    return {
      allowed: true,
      client,
      onTrial: true
    };
  }

  if (client.status === 'suspended') {

    return {
      allowed: false,
      message: suspendedMessage()
    };
  }

  return {
    allowed: false,
    message: expiredMessage()
  };
}

/* ─────────────────────────────────────────────────────────────
   CHECK MODULE ACCESS
───────────────────────────────────────────────────────────── */

export async function checkModuleAccess(phone, command) {

  const subResult = await verifySubscription(phone);

  if (!subResult.allowed) {
    return subResult;
  }

  const plan = subResult.client.plan || 'trial';

  const allowed =
    PLAN_COMMANDS[plan] || PLAN_COMMANDS.trial;

  if (allowed.includes('ALL')) {

    return {
      allowed: true,
      client: subResult.client
    };
  }

  if (
    allowed.includes(command.toUpperCase())
  ) {

    return {
      allowed: true,
      client: subResult.client
    };
  }

  const planRequired =
    getPlanRequiredFor(command);

  return {
    allowed: false,
    client: subResult.client,

    message:
      `⚠️ *Feature not available on your plan*\n\n` +
      `Command: *${command}*\n` +
      `Your Plan: *${PRICING[plan]?.label || plan}*\n` +
      `Required: *${planRequired}*\n\n` +
      `Upgrade to unlock this feature.\n` +
      `Contact: ${process.env.ADMIN_PHONE || 'admin'}`
  };
}

/* ─────────────────────────────────────────────────────────────
   GET PLAN REQUIRED
───────────────────────────────────────────────────────────── */

function getPlanRequiredFor(command) {

  const cmd = command.toUpperCase();

  if (PLAN_COMMANDS.MICRO.includes(cmd)) {
    return 'Micro (₦5,000/month)';
  }

  if (PLAN_COMMANDS.PRO.includes(cmd)) {
    return 'Pro (₦10,000/month)';
  }

  return 'SME (₦25,000/month)';
}

/* ─────────────────────────────────────────────────────────────
   SUBSCRIPTION STATUS
───────────────────────────────────────────────────────────── */

export async function getSubscriptionStatus(phone) {

  const client = await db.getOne(
    `SELECT * FROM clients WHERE phone=$1`,
    [phone]
  );

  if (!client) {
    return noSubscriptionMessage();
  }

  const plan =
    PRICING[client.plan] || PRICING.trial;

  let daysLeft = null;

  if (
    client.status === 'trial' &&
    client.trial_ends_at
  ) {

    daysLeft = Math.max(
      0,
      Math.ceil(
        (
          new Date(client.trial_ends_at) -
          Date.now()
        ) / 86400000
      )
    );

  } else if (client.subscription_expires_at) {

    daysLeft = Math.max(
      0,
      Math.ceil(
        (
          new Date(client.subscription_expires_at) -
          Date.now()
        ) / 86400000
      )
    );
  }

  const sym =
    client.currency_symbol || '₦';

  let msg =
    `📋 *SUBSCRIPTION STATUS*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n`;

  if (client.business_name) {
    msg += `🏪 ${client.business_name}\n\n`;
  }

  msg += `📦 Plan: *${plan.label}*\n`;
  msg += `📊 Status: *${client.status.toUpperCase()}*\n`;

  if (client.status === 'trial') {

    msg +=
      `⏰ Trial ends in: *${daysLeft} day${daysLeft !== 1 ? 's' : ''}*\n`;

  } else if (daysLeft !== null) {

    msg +=
      `📅 Renews in: *${daysLeft} day${daysLeft !== 1 ? 's' : ''}*\n`;
  }

  if (plan.amount > 0) {

    msg +=
      `💰 Plan Cost: *${sym}${plan.amount.toLocaleString()}/month*\n`;
  }

  msg +=
    `\n📞 ${process.env.ADMIN_PHONE || 'admin'}\n`;

  return msg;
}

/* ─────────────────────────────────────────────────────────────
   ACTIVATE SUBSCRIPTION
───────────────────────────────────────────────────────────── */

export async function activateSubscription(
  phone,
  plan = 'MICRO',
  months = 1
) {

  const expiry = new Date();

  expiry.setMonth(
    expiry.getMonth() + months
  );

  const client = await db.getOne(`
    UPDATE clients
    SET status='active',
        plan=$2,
        subscription_expires_at=$3,
        subscription_started_at=
          COALESCE(subscription_started_at,NOW()),
        updated_at=NOW()
    WHERE phone=$1
    RETURNING *
  `,[phone, plan, expiry]);

  if (!client) {
    throw new Error(
      `Client not found: ${phone}`
    );
  }

  return client;
}

/* ─────────────────────────────────────────────────────────────
   QUEUE NOTIFICATION
───────────────────────────────────────────────────────────── */

export async function queueNotification(
  client,
  message,
  type = 'general'
) {

  await db.query(`
    INSERT INTO notifications(
      client_id,
      phone,
      message,
      notification_type,
      status
    )
    VALUES($1,$2,$3,$4,'pending')
  `,[
    client.id || null,
    client.phone,
    message,
    type
  ]);
}

/* ─────────────────────────────────────────────────────────────
   MESSAGE HELPERS
───────────────────────────────────────────────────────────── */

function noSubscriptionMessage() {

  return (
    `❌ *Account Not Registered*\n\n` +
    `Contact: ${process.env.ADMIN_PHONE || 'admin'}`
  );
}

function expiredMessage() {

  return (
    `❌ *Subscription Expired*\n\n` +
    `Renew now: ${process.env.ADMIN_PHONE || 'admin'}`
  );
}

function trialExpiredMessage() {

  return (
    `⏰ *Trial Ended*\n\n` +
    `Contact: ${process.env.ADMIN_PHONE || 'admin'}`
  );
}

function suspendedMessage() {

  return (
    `⚠️ *Account Suspended*\n\n` +
    `Contact admin: ${process.env.ADMIN_PHONE || 'admin'}`
  );
}

/* ─────────────────────────────────────────────────────────────
   DEFAULT EXPORT
───────────────────────────────────────────────────────────── */

export default {
  verifySubscription,
  checkModuleAccess,
  getSubscriptionStatus,
  activateSubscription,
  queueNotification,
  PRICING,
  PLAN_COMMANDS
};