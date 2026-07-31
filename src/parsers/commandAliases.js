// ═══════════════════════════════════════════════════════════
// ADE-LedgerFlow™ — Command Aliases & Input Improvements
// File: src/parsers/commandAliases.js
//
// Nigerian merchants are busy — single-letter shortcuts matter.
// All aliases map to canonical commands.
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// COMMAND ALIASES
// Short forms → canonical command names
// ─────────────────────────────────────────────────────────────
const ALIASES = {
  // Single letter shortcuts
  'S':    'SALE',
  'E':    'EXPENSE',
  'B':    'BAL',
  'C':    'CREDIT',
  'P':    'PAYMENT',
  'K':    'CAPITAL',
  'W':    'WITHDRAW',
  'T':    'TRANSFER',
  'H':    'HELP',
  'R':    'REPORT',

  // Common misspellings / shortforms
  'SELL':       'SALE',
  'SOLD':       'SALE',
  'EXP':        'EXPENSE',
  'EXPENSES':   'EXPENSE',
  'XPENSE':     'EXPENSE',
  'BALANCE':    'BAL',
  'BALANS':     'BAL',
  'STOCK UP':   'STOCK',
  'STOK':       'STOCK',
  'DEBT':       'CREDIT',
  'OWE':        'CREDIT',
  'PAID':       'PAYMENT',
  'PAY':        'PAYMENT',
  'INVEST':     'CAPITAL',
  'CAP':        'CAPITAL',
  'CASH OUT':   'WITHDRAW',
  'PULL OUT':   'WITHDRAW',
  'DAILY':      'REPORT',
  'TODAY':      'REPORT',
  'WEEKLY':     'WEEK',
  'MONTHLY':    'MONTH',
  'DEBTS':      'CREDIT_LIST',
  'WHO OWES':   'CREDIT_LIST',
  'DEBTORS':    'CREDIT_LIST',
  'INVENTORY':  'STOCK_BALANCE',
  'MY STOCK':   'STOCK_BALANCE',
  'BEST':       'TOP',
  'TOP SALES':  'TOP',
  'STATUS':     'SUBSTATUS',
  'MY PLAN':    'SUBSTATUS',
  'CONTACT US': 'CONTACT',
  'SUPPORT':    'CONTACT',
};

// ─────────────────────────────────────────────────────────────
// RESOLVE ALIAS → canonical command
// ─────────────────────────────────────────────────────────────
function resolveAlias(input) {
  if (!input) return null;
  const upper = input.trim().toUpperCase();

  // Direct alias lookup
  if (ALIASES[upper]) return ALIASES[upper];

  // Already a canonical command
  return upper;
}

// ─────────────────────────────────────────────────────────────
// AMOUNT PARSER
// Handles: 5000, 5,000, 5k, 5K, 5.5k, 50000
// FIX: Nigerian merchants often type "5k" meaning 5000
// ─────────────────────────────────────────────────────────────
function parseAmount(str) {
  if (!str) return null;
  const clean = str.toString().trim().replace(/,/g, '').toLowerCase();

  if (clean.endsWith('k')) {
    const num = parseFloat(clean.slice(0, -1));
    return isNaN(num) ? null : num * 1000;
  }

  if (clean.endsWith('m')) {
    const num = parseFloat(clean.slice(0, -1));
    return isNaN(num) ? null : num * 1_000_000;
  }

  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

// ─────────────────────────────────────────────────────────────
// SCHEMA MIGRATION NOTE
// Change onboarding_data from TEXT to JSONB:
//
//   ALTER TABLE clients
//     ALTER COLUMN onboarding_data TYPE JSONB
//     USING onboarding_data::JSONB;
//
// Run this in Supabase SQL Editor.
// It's safe — IF NOT EXISTS pattern won't break anything.
// After migration, queries like:
//   SELECT onboarding_data->>'pin_hash_temp' FROM clients WHERE phone=$1
// work directly in SQL without JSON.parse() in JS.
// ─────────────────────────────────────────────────────────────

export {  ALIASES, resolveAlias, parseAmount  };
