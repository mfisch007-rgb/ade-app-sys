// src/config/plans.js
// ADE-LedgerFlow™ — Subscription Plan Definitions
//
// Plan names corrected to match owner's specification:
// trial → MICROLEGER → BASIC → STANDARD → PRO → BUSINESS ELITE → ENTERPRISE CLOUD
//
// AUTO-UPGRADE LOGIC (as specified):
// - Trial: warn twice on heavy usage, then port to next paid plan
// - Any plan: warn twice if usage limit hit, then port UP (never down)
// - Downgrade only on explicit client request — never automatic

export const PLAN_RANK = {
  trial:            0,
  MICROLEGER:       1,
  BASIC:            2,
  STANDARD:         3,
  PRO:              4,
  "BUSINESS ELITE": 5,
  "ENTERPRISE CLOUD": 6,
}

export const PLANS = {

  trial: {
    code:         "trial",
    name:         "Free Trial",
    rank:         0,
    price_ngn:    0,
    price_usd:    0,
    trial_days_min: 1,
    trial_days_max: 15,
    commands: [
      "SALE","EXPENSE","BAL","HELP","START","SUBSTATUS","CONTACT"
    ],
    limits: {
      transactions_daily: 10,
      // When either limit is hit → warn client twice → auto-upgrade to MICROLEGER
      warn_at_percent: 80,   // warn when 80% of limit used
    },
    auto_upgrade_to: "MICROLEGER",
    features: [
      "✅ Sales & expense recording",
      "✅ Daily balance check",
      "✅ Up to 15 days free",
      "⚠️ Heavy usage = auto-upgrade to paid plan",
    ],
  },

  MICROLEGER: {
    code:      "MICROLEGER",
    name:      "ADE-MicroLedger",
    rank:      1,
    price_ngn: 2500,
    price_usd: 2,
    tagline:   "For market traders & daily cash tracking",
    commands: [
      "SALE","EXPENSE","BAL","BALANCE","HELP","START","SUBSTATUS","CONTACT"
    ],
    limits: {
      transactions_daily: 20,
      warn_at_percent:    80,
    },
    auto_upgrade_to: "BASIC",
    features: [
      "✅ Sales & expense recording",
      "✅ Daily balance check",
      "✅ WhatsApp support",
    ],
  },

  BASIC: {
    code:      "BASIC",
    name:      "ADE-Basic",
    rank:      2,
    price_ngn: 5000,
    price_usd: 4,
    tagline:   "For small shops and daily businesses",
    commands: [
      "SALE","EXPENSE","CAPITAL","BAL","BALANCE",
      "REPORT","WEEK","HELP","HISTORY","TOP",
      "START","SUBSTATUS","CONTACT"
    ],
    limits: {
      transactions_daily: 100,
      warn_at_percent:    80,
    },
    auto_upgrade_to: "STANDARD",
    features: [
      "✅ All MicroLedger features",
      "✅ Weekly reports",
      "✅ Top sellers",
      "✅ Transaction history",
      "✅ 8PM daily auto-report",
    ],
  },

  STANDARD: {
    code:      "STANDARD",
    name:      "ADE-Standard",
    rank:      3,
    price_ngn: 10000,
    price_usd: 8,
    tagline:   "For established businesses with credit customers",
    commands: [
      "SALE","EXPENSE","CAPITAL","BAL","BALANCE",
      "REPORT","WEEK","MONTH","CREDIT","PAYMENT",
      "CREDIT_LIST","STOCK","STOCK_BALANCE",
      "HELP","HISTORY","TOP","START","SUBSTATUS","CONTACT"
    ],
    limits: {
      transactions_daily: 500,
      warn_at_percent:    80,
    },
    auto_upgrade_to: "PRO",
    features: [
      "✅ All Basic features",
      "✅ Credit ledger & debt tracking",
      "✅ Monthly reports",
      "✅ Stock management",
      "✅ Google Sheets integration",
    ],
  },

  PRO: {
    code:      "PRO",
    name:      "ADE-Pro Merchant",
    rank:      4,
    price_ngn: 25000,
    price_usd: 20,
    tagline:   "For serious businesses with staff",
    commands: [
      "SALE","EXPENSE","CAPITAL","BAL","BALANCE",
      "REPORT","WEEK","MONTH","CREDIT","PAYMENT",
      "CREDIT_LIST","STOCK","STOCK_BALANCE","TOP",
      "HISTORY","WITHDRAW","TRANSFER","CONTRIB",
      "ADD_STAFF","REMOVE_STAFF","STAFF_LIST",
      "HELP","START","SUBSTATUS","CONTACT"
    ],
    limits: {
      transactions_daily: 2000,
      max_staff:          5,
      warn_at_percent:    85,
    },
    auto_upgrade_to: "BUSINESS ELITE",
    features: [
      "✅ All Standard features",
      "✅ Up to 5 staff members",
      "✅ WhatsApp business dashboard",
      "✅ Staff activity tracking",
      "✅ Fraud detection alerts",
    ],
  },

  "BUSINESS ELITE": {
    code:      "BUSINESS ELITE",
    name:      "ADE-Business Elite",
    rank:      5,
    price_ngn: 50000,
    price_usd: 40,
    tagline:   "For multi-branch operations and pharmacies",
    commands:  ["ALL"],
    limits: {
      transactions_daily: -1,   // unlimited
      max_staff:          15,
      warn_at_percent:    90,
    },
    auto_upgrade_to: "ENTERPRISE CLOUD",
    features: [
      "✅ All Pro Merchant features",
      "✅ Up to 15 staff members",
      "✅ Full web dashboard",
      "✅ Drug/pharmacy module",
      "✅ Multi-branch support",
      "✅ PDF report exports",
      "✅ Priority support",
    ],
  },

  "ENTERPRISE CLOUD": {
    code:         "ENTERPRISE CLOUD",
    name:         "ADE-Enterprise Cloud",
    rank:         6,
    price_ngn:    0,   // custom pricing — contact ADE directly
    price_usd:    0,
    tagline:      "For large-scale operations — fully customizable",
    commands:     ["ALL"],
    limits: {
      transactions_daily: -1,   // unlimited
      max_staff:          -1,   // unlimited
      warn_at_percent:    95,
    },
    auto_upgrade_to: null,      // top tier — no higher plan
    features: [
      "✅ Everything in Business Elite",
      "✅ Unlimited staff",
      "✅ Dedicated account manager",
      "✅ Custom features on request",
      "✅ API access",
      "✅ White-label option",
      "✅ SLA guarantee",
      "✅ AI-powered insights",
      "✅ Direct ADE engineering line",
    ],
  },
}

// ─────────────────────────────────────────────────────────────
// AUTO-UPGRADE ENGINE
// Called when a client hits their usage limit
// Warns twice before porting up — never ports down automatically
// ─────────────────────────────────────────────────────────────

/**
 * Check if a client's usage triggers a warning or upgrade
 * @param {string} planCode - current plan code
 * @param {number} dailyTransactions - transactions today
 * @returns {{ action: 'warn'|'upgrade'|'none', upgradeTo: string|null }}
 */
export function checkUsageThreshold(planCode, dailyTransactions) {
  const plan = PLANS[planCode]
  if (!plan) return { action: "none", upgradeTo: null }

  const limit = plan.limits.transactions_daily
  if (limit === -1) return { action: "none", upgradeTo: null }   // unlimited

  const pct = (dailyTransactions / limit) * 100

  if (pct >= 100) {
    return {
      action:    "upgrade",
      upgradeTo: plan.auto_upgrade_to,
      message:   `You have reached your daily limit on the *${plan.name}* plan.\n` +
                 `Your account is being upgraded to *${PLANS[plan.auto_upgrade_to]?.name || plan.auto_upgrade_to}*.\n` +
                 `Contact admin for billing details: ${process.env.ADMIN_PHONE}`,
    }
  }

  if (pct >= plan.limits.warn_at_percent) {
    return {
      action:    "warn",
      upgradeTo: plan.auto_upgrade_to,
      message:   `⚠️ *Usage Alert*\n\n` +
                 `You have used ${Math.round(pct)}% of your daily limit on *${plan.name}*.\n` +
                 `Consider upgrading to *${PLANS[plan.auto_upgrade_to]?.name || plan.auto_upgrade_to}* for more capacity.\n` +
                 `Contact: ${process.env.ADMIN_PHONE}`,
    }
  }

  return { action: "none", upgradeTo: null }
}

/**
 * Check if a client can use a specific command on their plan
 */
export function canUseCommand(planCode, command) {
  const plan = PLANS[planCode]
  if (!plan) return false

  if (plan.commands.includes("ALL")) return true

  const universal = ["HELP", "START", "SUBSTATUS", "CONTACT"]
  if (universal.includes(command.toUpperCase())) return true

  return plan.commands.includes(command.toUpperCase())
}

/**
 * Upgrade message when client tries a locked command
 */
export function getUpgradePrompt(currentPlanCode, command) {
  const current = PLANS[currentPlanCode]
  const sym = "₦"

  // Find lowest plan that has this command
  const needed = Object.values(PLANS).find(p =>
    p.commands.includes("ALL") || p.commands.includes(command.toUpperCase())
  )

  if (!needed) return `❌ Feature not available. Contact admin.`

  const price = needed.price_ngn === 0
    ? "Contact ADE for pricing"
    : `${sym}${needed.price_ngn.toLocaleString()}/month`

  return `⚠️ *Feature Locked*\n\n` +
    `Command: *${command}*\n` +
    `Your Plan: *${current?.name || currentPlanCode}*\n\n` +
    `Unlock with: *${needed.name}*\n` +
    `Price: *${price}*\n\n` +
    `📞 Upgrade: ${process.env.ADMIN_PHONE}\n` +
    `_Type SUBSTATUS to see your current plan_`
}

/**
 * Pricing broadcast message
 */
export function getPricingMessage() {
  return `💼 *ADE-LedgerFlow™ Plans*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Alpha-Aliph Automated Digital Enterprise_\n\n` +
    `🆓 *Free Trial* — Up to 15 days\n` +
    `   Basic tracking to test the system\n\n` +
    `🔵 *MicroLedger* — ₦2,500/month\n` +
    `   Market traders, petty cash\n\n` +
    `🟢 *Basic* — ₦5,000/month\n` +
    `   Small shops, daily reports\n\n` +
    `🟡 *Standard* — ₦10,000/month\n` +
    `   Credit ledger, stock tracking\n\n` +
    `🟠 *Pro Merchant* — ₦25,000/month\n` +
    `   Multi-staff, full dashboard\n\n` +
    `🔴 *Business Elite* — ₦50,000/month\n` +
    `   Multi-branch, pharmacy module\n\n` +
    `⭐ *Enterprise Cloud* — Custom pricing\n` +
    `   Large companies, full customization\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 All plans include FREE trial!\n` +
    `📞 Subscribe: ${process.env.ADMIN_PHONE}\n\n` +
    `_ADE-LedgerFlow™ © Alpha-Aliph Digital Enterprise_`
}