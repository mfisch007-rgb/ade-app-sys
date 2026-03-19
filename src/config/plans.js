// ═══════════════════════════════════════════════════════════
// Alpha-Aliph ADE-LedgerFlow™ — Subscription Plans
// File: src/config/plans.js
//
// KEY ARCHITECTURE DECISION:
// Subscriptions are tied to CLIENT ID (UUID), NOT phone number.
// The bot phone number is ONLY a communication channel.
// You can change the bot number any time — zero client impact.
// You can change A CLIENT's number — their subscription, history,
// streak, milestones all stay perfectly intact.
// ═══════════════════════════════════════════════════════════

const PLANS = {

  // ── TIER 1: ADE-MicroLedger ─────────────────────────────
  // Designed for: market traders, roadside vendors, daily petty cash
  MICROLEGER: {
    code:          'MICROLEGER',
    name:          'ADE-MicroLedger',
    tagline:       'For everyday personal & micro-business tracking',
    price_ngn:     2500,
    price_usd:     2,
    trial_days:    7,
    commands: [
      'SALE','EXPENSE','BAL','BALANCE','HELP','START','SUBSTATUS','CONTACT'
    ],
    features: [
      '✅ Sales & expense recording',
      '✅ Daily balance check',
      '✅ 7-day free trial',
      '✅ WhatsApp support',
      '❌ Reports (upgrade to Basic)',
      '❌ Credit ledger',
      '❌ Stock tracking',
    ],
    max_transactions_daily: 20,
    max_staff:              0,
    has_dashboard:          false,
    has_sheets:             false,
  },

  // ── TIER 2: ADE-Basic ───────────────────────────────────
  // Designed for: small shops, mini supermarkets, kiosks
  BASIC: {
    code:          'BASIC',
    name:          'ADE-Basic',
    tagline:       'For small shops and everyday businesses',
    price_ngn:     5000,
    price_usd:     4,
    trial_days:    14,
    commands: [
      'SALE','EXPENSE','CAPITAL','BAL','BALANCE',
      'REPORT','WEEK','HELP','HISTORY','TOP',
      'START','SUBSTATUS','CONTACT'
    ],
    features: [
      '✅ All MicroLedger features',
      '✅ Weekly reports',
      '✅ Top sellers',
      '✅ Transaction history',
      '✅ 14-day free trial',
      '✅ 8PM daily auto-report',
      '❌ Credit ledger (upgrade to Standard)',
      '❌ Stock management',
    ],
    max_transactions_daily: 100,
    max_staff:              0,
    has_dashboard:          false,
    has_sheets:             true,
  },

  // ── TIER 3: ADE-Standard ────────────────────────────────
  // Designed for: regular businesses, supermarkets, phone shops
  STANDARD: {
    code:          'STANDARD',
    name:          'ADE-Standard',
    tagline:       'For established businesses with credit customers',
    price_ngn:     10000,
    price_usd:     8,
    trial_days:    14,
    commands: [
      'SALE','EXPENSE','CAPITAL','BAL','BALANCE',
      'REPORT','WEEK','MONTH','CREDIT','PAYMENT',
      'CREDIT_LIST','STOCK','STOCK_BALANCE',
      'HELP','HISTORY','TOP','START','SUBSTATUS','CONTACT'
    ],
    features: [
      '✅ All Basic features',
      '✅ Credit ledger & debt tracking',
      '✅ Monthly reports',
      '✅ Stock management',
      '✅ Automated credit reminders',
      '✅ Google Sheets integration',
      '❌ Multi-staff (upgrade to Pro)',
      '❌ Business dashboard',
    ],
    max_transactions_daily: 500,
    max_staff:              0,
    has_dashboard:          false,
    has_sheets:             true,
  },

  // ── TIER 4: ADE-Pro Merchant ────────────────────────────
  // Designed for: serious merchants, multi-staff businesses
  PRO: {
    code:          'PRO',
    name:          'ADE-Pro Merchant',
    tagline:       'For serious businesses with staff',
    price_ngn:     25000,
    price_usd:     20,
    trial_days:    14,
    commands: [
      'SALE','EXPENSE','CAPITAL','BAL','BALANCE',
      'REPORT','WEEK','MONTH','CREDIT','PAYMENT',
      'CREDIT_LIST','STOCK','STOCK_BALANCE','TOP',
      'HISTORY','WITHDRAW','TRANSFER','CONTRIB',
      'ADD_STAFF','REMOVE_STAFF','STAFF_LIST',
      'HELP','START','SUBSTATUS','CONTACT'
    ],
    features: [
      '✅ All Standard features',
      '✅ Add up to 5 staff members',
      '✅ WhatsApp-based business dashboard',
      '✅ Staff activity tracking',
      '✅ Fraud detection & alerts',
      '✅ Withdrawal & transfer tracking',
      '✅ Savings contributions',
      '❌ Drug/pharmacy module (upgrade to Business)',
    ],
    max_transactions_daily: 2000,
    max_staff:              5,
    has_dashboard:          true,     // WhatsApp dashboard
    has_web_dashboard:      false,
    has_sheets:             true,
  },

  // ── TIER 5: ADE-Business ───────────────────────────────
  // Designed for: pharmacies, distributors, multi-branch
  BUSINESS: {
    code:          'BUSINESS',
    name:          'ADE-Business',
    tagline:       'For multi-branch operations and pharmacies',
    price_ngn:     50000,
    price_usd:     40,
    trial_days:    14,
    commands:      ['ALL'],   // all commands unlocked
    features: [
      '✅ All Pro Merchant features',
      '✅ Up to 15 staff members',
      '✅ Full web dashboard',
      '✅ Drug/pharmacy inventory module',
      '✅ Multi-branch support',
      '✅ Advanced analytics',
      '✅ PDF report exports',
      '✅ Accountant access link',
      '✅ Priority WhatsApp support',
    ],
    max_transactions_daily: -1,      // unlimited
    max_staff:              15,
    has_dashboard:          true,
    has_web_dashboard:      true,
    has_sheets:             true,
    has_pdf:                true,
  },

  // ── TIER 6: ADE-Enterprise ─────────────────────────────
  // Designed for: large companies, industries, NGOs
  ENTERPRISE: {
    code:          'ENTERPRISE',
    name:          'ADE-Enterprise',
    tagline:       'For large-scale operations — fully customizable',
    price_ngn:     0,         // custom pricing — contact ADE
    price_usd:     0,
    trial_days:    30,        // 30-day trial for enterprise
    commands:      ['ALL'],
    features: [
      '✅ Everything in Business',
      '✅ Unlimited staff members',
      '✅ Dedicated account manager',
      '✅ Custom features on request',
      '✅ API access for integrations',
      '✅ White-label option',
      '✅ SLA guarantee',
      '✅ On-site training (Lagos — other cities by arrangement)',
      '✅ Custom reports and exports',
      '✅ AI-powered insights and forecasting',
      '✅ Direct WhatsApp line to ADE engineering team',
    ],
    max_transactions_daily: -1,
    max_staff:              -1,
    has_dashboard:          true,
    has_web_dashboard:      true,
    has_sheets:             true,
    has_pdf:                true,
    custom_pricing:         true,
  },
};

// ─────────────────────────────────────────────────────────────
// PLAN HIERARCHY (lower number = lower tier)
// ─────────────────────────────────────────────────────────────
const PLAN_RANK = {
  trial:       0,
  MICROLEGER:  1,
  BASIC:       2,
  STANDARD:    3,
  PRO:         4,
  BUSINESS:    5,
  ENTERPRISE:  6,
};

// ─────────────────────────────────────────────────────────────
// CHECK if a client can use a command
// ─────────────────────────────────────────────────────────────
function canUseCommand(planCode, command) {
  const plan = PLANS[planCode];
  if (!plan) return false;

  // Enterprise and Business get everything
  if (plan.commands.includes('ALL')) return true;

  // System commands everyone can use
  const universal = ['HELP','START','SUBSTATUS','CONTACT'];
  if (universal.includes(command.toUpperCase())) return true;

  return plan.commands.includes(command.toUpperCase());
}

// ─────────────────────────────────────────────────────────────
// UPGRADE MESSAGE when client tries a higher-tier command
// ─────────────────────────────────────────────────────────────
function getUpgradeMessage(currentPlan, command, currency = '₦') {
  const current  = PLANS[currentPlan];
  const sym      = currency;

  // Find which plan first unlocks this command
  const upgradeTo = Object.values(PLANS).find(p =>
    p.commands.includes('ALL') || p.commands.includes(command.toUpperCase())
  );

  if (!upgradeTo) return `❌ Feature not available. Contact ADE support.`;

  const price = currency === '$' ? upgradeTo.price_usd : upgradeTo.price_ngn;
  const priceStr = price === 0 ? 'Contact ADE for pricing' : `${sym}${price.toLocaleString()}/month`;

  return `⚠️ *Feature Locked*\n\n` +
    `Command: *${command}*\n` +
    `Your Plan: *${current?.name || currentPlan}*\n\n` +
    `Unlock with: *${upgradeTo.name}*\n` +
    `Price: *${priceStr}*\n\n` +
    `📞 Upgrade: ${process.env.ADMIN_PHONE}\n` +
    `_Type SUBSTATUS to see your current plan_`;
}

// ─────────────────────────────────────────────────────────────
// PRICING CARD (for WhatsApp broadcast / status)
// ─────────────────────────────────────────────────────────────
function getPricingMessage(currency = '₦') {
  const sym  = currency;
  const isNG = sym === '₦';

  return `💼 *ADE-LedgerFlow™ Plans*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Alpha-Aliph Automated Digital Enterprise_\n\n` +

    `🔵 *MicroLedger* — ${isNG ? '₦2,500' : '$2'}/month\n` +
    `   Market traders, daily petty cash\n\n` +

    `🟢 *Basic* — ${isNG ? '₦5,000' : '$4'}/month\n` +
    `   Small shops, kiosks, reports\n\n` +

    `🟡 *Standard* — ${isNG ? '₦10,000' : '$8'}/month\n` +
    `   Credit ledger, stock tracking\n\n` +

    `🟠 *Pro Merchant* — ${isNG ? '₦25,000' : '$20'}/month\n` +
    `   Multi-staff, full dashboard\n\n` +

    `🔴 *Business* — ${isNG ? '₦50,000' : '$40'}/month\n` +
    `   Multi-branch, pharmacy module\n\n` +

    `⭐ *Enterprise* — Custom pricing\n` +
    `   Large companies, full customization\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 All plans include FREE trial!\n` +
    `📞 Subscribe: ${process.env.ADMIN_PHONE}\n\n` +
    `_ADE-LedgerFlow™ © Alpha-Aliph Digital Enterprise_`;
}

module.exports = {
  PLANS,
  PLAN_RANK,
  canUseCommand,
  getUpgradeMessage,
  getPricingMessage,
};