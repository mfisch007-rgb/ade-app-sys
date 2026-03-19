// ═══════════════════════════════════════════════════════════
// LedgerFlow — Message Parser (FINAL COMPLETE VERSION)
// File: src/parsers/messageParser.js
//
// FIXES:
//   FATAL-09: WITHDRAW, TRANSFER, CONTRIB, DRUGSTOCK, DRUGSALE added
//   FATAL-12: SUBSTATUS command added
//   FATAL-13: CONTACT + 1/2/3/4 support menu added
//   FATAL-20: MONTH / handleMonth() added
//   GAP-07:   Natural language fallback via old commandParser
//   GAP-08:   STOCK BALANCE added
//   GAP-09:   DAILY REPORT / WEEKLY REPORT / MONTHLY REPORT multi-word added
//   GAP-11:   CONTRIB added
//   GAP-12:   START added
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const db     = require('../config/database');
const sheets = require('../sheets/sheetsClient');
const { checkModuleAccess, getSubscriptionStatus } = require('../engines/subscriptionEngine');
const { isRateLimited, updateRiskScore, logSecurityEvent } = require('../engines/securityEngine');

// Natural language fallback from old commandParser
let intelligentParse = null;
try {
  ({ intelligentParse } = require('../engines/commandParser'));
} catch { /* commandParser.js optional — use if exists */ }

// ─────────────────────────────────────────────────────────────
// LANGUAGE DETECTION
// ─────────────────────────────────────────────────────────────
function detectLanguage(text) {
  const t = text.toLowerCase();
  if (/\b(owo|tita|ra |se|lo|ni |fun|o se|e joo)\b/.test(t)) return 'yo';
  if (/\b(kudi|saya|siyar|kaya|don allah|na gode|ciniki)\b/.test(t)) return 'ha';
  if (/\b(ego|ire|biko|maka|ahia|azụmahịa)\b/.test(t)) return 'ig';
  if (/\b(abeg|oga|abi|dey|sabi|dem|una|naira|e don|how much|wetin)\b/.test(t)) return 'pcm';
  return 'en';
}

// ─────────────────────────────────────────────────────────────
// TRANSLATIONS
// ─────────────────────────────────────────────────────────────
const T = {
  en:  { sale_ok:'✅ *SALE RECORDED!*', expense_ok:'📝 *EXPENSE RECORDED*', stock_ok:'📦 *STOCK UPDATED*', credit_ok:'🔴 *CREDIT RECORDED*', payment_ok:'💚 *PAYMENT RECEIVED*', capital_ok:'💼 *CAPITAL ADDED*', withdraw_ok:'🏧 *WITHDRAWAL RECORDED*', transfer_ok:'🏦 *TRANSFER RECORDED*', contrib_ok:'💰 *CONTRIBUTION SAVED*', drugstock_ok:'💊 *DRUG STOCK UPDATED*', drugsale_ok:'💊 *DRUG SALE RECORDED*', today_snap:'📊 *TODAY\'S SNAPSHOT*', streak:'🔥 {n}-Day Streak!', unknown:'🤔 Command not recognised.\nType *HELP* to see all commands.', not_found:'❌ Not registered. Contact admin to activate.', inactive:'⚠️ Subscription expired. Contact admin to renew.', rate_limited:'⏳ Too many messages. Wait 1 minute and try again.' },
  yo:  { sale_ok:'✅ *A TI GBA OWO TITA!*', expense_ok:'📝 *INAWO TI GBA*', stock_ok:'📦 *STOK TI UPDATE*', credit_ok:'🔴 *GBESE TI GBA*', payment_ok:'💚 *OWO TI DE*', capital_ok:'💼 *OWO IPO TI WO*', withdraw_ok:'🏧 *ISEYAWO TI GBA*', transfer_ok:'🏦 *GBIGBE OWO TI GBA*', contrib_ok:'💰 *IDAWOTA TI GBA*', drugstock_ok:'💊 *OGUN TI WO*', drugsale_ok:'💊 *OGUN TI TA*', today_snap:'📊 *IWOYE LONI*', streak:'🔥 Ojo {n}!', unknown:'🤔 Mi o ye eyi.\nFo *HELP*.', not_found:'❌ Iṣowo yi ko si. E kan si oluṣakoso.', inactive:'⚠️ Alabapin re ti pari.', rate_limited:'⏳ Dawọ. Da duro iṣẹju kan.' },
  ha:  { sale_ok:'✅ *AN RUBUTA SIYARWA!*', expense_ok:'📝 *AN RUBUTA KASHE*', stock_ok:'📦 *AN SABUNTA KAYA*', credit_ok:'🔴 *AN RUBUTA BASHI*', payment_ok:'💚 *AN KARBI KUDI*', capital_ok:'💼 *AN KARA JARI*', withdraw_ok:'🏧 *FITAR KUDI*', transfer_ok:'🏦 *AIKA KUDI*', contrib_ok:'💰 *GUDUNMUWA*', drugstock_ok:'💊 *MAGANI YA YI*', drugsale_ok:'💊 *AN SAYAR MAGANI*', today_snap:'📊 *YANAYI YAU*', streak:'🔥 Kwana {n}!', unknown:'🤔 Ban fahimci ba.\nFo *HELP*.', not_found:'❌ Ba a yi rajista ba.', inactive:'⚠️ Biyan kudi ya kare.', rate_limited:'⏳ Jira dakika daya.' },
  ig:  { sale_ok:'✅ *EDEPỤTARA IRE!*', expense_ok:'📝 *EDEPỤTARA NKWỤ*', stock_ok:'📦 *ETINYE NGWA*', credit_ok:'🔴 *EDEPỤTARA ỌBỤLỌ*', payment_ok:'💚 *NATA EGO*', capital_ok:'💼 *ETINYE ISI EGO*', withdraw_ok:'🏧 *WEPU EGO*', transfer_ok:'🏦 *ZIGARA EGO*', contrib_ok:'💰 *NTINYE EGO*', drugstock_ok:'💊 *ETINYE OGU*', drugsale_ok:'💊 *IRE OGU*', today_snap:'📊 *ỌNỌDỤ TATA*', streak:'🔥 Ụbọchị {n}!', unknown:'🤔 Aghọtachaghị.\nPụta *HELP*.', not_found:'❌ Adịghị. Kpọtụrụ onye njikwa.', inactive:'⚠️ Ndenye aha agwụla.', rate_limited:'⏳ Chere nkeji otu.' },
  pcm: { sale_ok:'✅ *SALE DON GO IN!*', expense_ok:'📝 *EXPENSE DON ENTER*', stock_ok:'📦 *STOCK DON UPDATE*', credit_ok:'🔴 *CREDIT DON RECORD*', payment_ok:'💚 *PAYMENT DON REACH*', capital_ok:'💼 *CAPITAL DON ENTER*', withdraw_ok:'🏧 *WITHDRAWAL DON RECORD*', transfer_ok:'🏦 *TRANSFER DON RECORD*', contrib_ok:'💰 *CONTRIBUTION DON SAVE*', drugstock_ok:'💊 *DRUG STOCK DON UPDATE*', drugsale_ok:'💊 *DRUG SALE DON RECORD*', today_snap:'📊 *TODAY SO FAR*', streak:'🔥 {n} days straight!', unknown:'🤔 I no sabi wetin you talk.\nType *HELP*.', not_found:'❌ This biz no dey our system.', inactive:'⚠️ Your subscription don expire.', rate_limited:'⏳ Calm down. Wait one minute.' },
};

function t(lang, key, vars = {}) {
  let str = (T[lang] || T.en)[key] || T.en[key] || key;
  for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
  return str;
}

// ─────────────────────────────────────────────────────────────
// COMMAND EXTRACTION
// ─────────────────────────────────────────────────────────────
const ALL_COMMANDS = [
  'CREDIT LIST','STOCK BALANCE','DAILY REPORT','WEEKLY REPORT','MONTHLY REPORT',   // multi-word first
  'SALE','EXPENSE','STOCK','CREDIT','PAYMENT','CAPITAL',
  'WITHDRAW','TRANSFER','CONTRIB','DRUGSTOCK','DRUGSALE',
  'BAL','BALANCE','REPORT','WEEK','MONTH','HELP','TOP','HISTORY','UNDO',
  'SUBSTATUS','CONTACT','START',
  '1','2','3','4',
];

function extractCommand(text) {
  const upper = text.toUpperCase().trim();

  // Multi-word commands first (order matters)
  if (upper.startsWith('CREDIT LIST') || upper.includes('CREDIT LIST')) return { type:'CREDIT_LIST' };
  if (upper.startsWith('STOCK BALANCE') || upper === 'STOCK BALANCE') return { type:'STOCK_BALANCE' };
  if (upper.startsWith('DAILY REPORT') || upper === 'DAILY REPORT' || upper === 'CLOSE DAY') return { type:'REPORT' };
  if (upper.startsWith('WEEKLY REPORT') || upper === 'WEEKLY REPORT') return { type:'WEEK' };
  if (upper.startsWith('MONTHLY REPORT') || upper === 'MONTHLY REPORT') return { type:'MONTH' };

  // Single keyword commands
  for (const cmd of ALL_COMMANDS) {
    if (cmd.includes(' ')) continue;   // already handled above
    const idx = upper.indexOf(cmd);
    if (idx === -1) continue;
    // Must be at word boundary (start of string or preceded by space)
    if (idx > 0 && upper[idx-1] !== ' ') continue;
    const rest = upper.slice(idx + cmd.length).trim();
    return parseArgs(cmd, rest);
  }

  // Natural language fallback (old commandParser)
  if (intelligentParse) {
    const nlpResult = intelligentParse(text);
    if (nlpResult && !nlpResult.error) {
      return { type: nlpResult.action, amount: nlpResult.value, item: nlpResult.target, person: nlpResult.target, raw: text };
    }
  }

  return { type: 'UNKNOWN', raw: text };
}

function parseArgs(type, rest) {
  if (['BAL','BALANCE','REPORT','WEEK','MONTH','HELP','CREDIT_LIST','STOCK_BALANCE',
       'HISTORY','TOP','UNDO','SUBSTATUS','CONTACT','START','1','2','3','4'].includes(type)) {
    return { type };
  }

  const tokens    = rest.split(/\s+/).filter(Boolean);
  let amount      = null;
  let itemTokens  = [];

  for (const token of tokens) {
    // Handle "5k" shorthand
    const numStr = token.replace(/,/g, '').toLowerCase();
    const n = numStr.endsWith('k') ? parseFloat(numStr) * 1000 : parseFloat(numStr);
    if (!isNaN(n) && amount === null) {
      amount = n;
    } else {
      itemTokens.push(token);
    }
  }

  return {
    type,
    amount:   amount   || 0,
    quantity: type === 'STOCK' ? amount : null,
    item:     itemTokens.join(' ') || 'GENERAL',
    person:   itemTokens.join(' ') || null,
    bank:     itemTokens.join(' ') || null,
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function fmt(amount, sym = '₦') {
  return `${sym}${parseFloat(amount||0).toLocaleString('en-NG', { minimumFractionDigits:0, maximumFractionDigits:0 })}`;
}
function fmtTime() {
  return new Date().toLocaleString('en-NG', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Africa/Lagos' });
}
function fmtDate() {
  return new Date().toLocaleDateString('en-NG', { weekday:'short', day:'numeric', month:'short', timeZone:'Africa/Lagos' });
}
function profitMargin(sales, expenses) {
  const s = parseFloat(sales||0), e = parseFloat(expenses||0);
  return s === 0 ? null : Math.round(((s-e)/s)*100);
}
function marginEmoji(m) {
  if (m===null) return '';
  if (m>=50) return '🌟 Excellent!'; if (m>=30) return '✅ Good'; if (m>=15) return '⚡ Moderate'; if (m>=0) return '⚠️ Low'; return '🔴 Negative!';
}

const DAILY_TIPS = [
  'Record every sale — even small ones. They add up fast.',
  'Review your CREDIT LIST weekly. Money owed = money lost.',
  'Track your top 3 selling items — always have them in stock.',
  'High expenses? Type WEEK to see where money is going.',
  'Share your LedgerFlow sheet with your accountant.',
  'Set a daily sales target. LedgerFlow tracks if you hit it.',
  'Fridays and Saturdays are typically highest sales days.',
  'Your CAPITAL shows your business net worth. Grow it.',
  'Credit customers delayed 30+ days cost you twice.',
  'Type TOP to see your best-selling products this month.',
];
function getDailyTip() {
  const d = Math.floor((Date.now() - new Date(new Date().getFullYear(),0,0))/86400000);
  return DAILY_TIPS[d % DAILY_TIPS.length];
}

// ─────────────────────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────────────────────
async function getTodayStats(clientId) {
  return db.getOne(`
    SELECT
      COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END),0) AS sales,
      COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END),0) AS expenses,
      COALESCE(SUM(CASE WHEN type='CREDIT'  THEN amount END),0) AS credit,
      COUNT(*) AS count
    FROM transactions
    WHERE client_id=$1 AND DATE(created_at AT TIME ZONE 'Africa/Lagos')=CURRENT_DATE
  `, [clientId]);
}

async function getMonthStats(clientId) {
  return db.getOne(`
    SELECT
      COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END),0) AS sales,
      COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END),0) AS expenses,
      COALESCE(SUM(CASE WHEN type='CAPITAL' THEN amount END),0) AS capital,
      COALESCE(SUM(CASE WHEN type='WITHDRAW' THEN amount END),0) AS withdrawals,
      COUNT(*) AS count,
      COUNT(DISTINCT DATE(created_at AT TIME ZONE 'Africa/Lagos')) AS active_days
    FROM transactions
    WHERE client_id=$1
      AND DATE_TRUNC('month', created_at AT TIME ZONE 'Africa/Lagos')
          = DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Lagos')
  `, [clientId]);
}

async function getOpenCredits(clientId) {
  return db.getOne(`
    SELECT COUNT(*) AS count, COALESCE(SUM(balance_owed),0) AS total
    FROM credits WHERE client_id=$1 AND status IN ('open','partial')
  `, [clientId]);
}

async function calculateStreak(clientId) {
  const rows = await db.getMany(`
    SELECT DISTINCT DATE(created_at AT TIME ZONE 'Africa/Lagos') AS tx_date
    FROM transactions WHERE client_id=$1
    ORDER BY tx_date DESC LIMIT 60
  `, [clientId]);
  if (!rows.length) return 0;
  let streak = 1;
  for (let i = 1; i < rows.length; i++) {
    const diffDays = Math.round((new Date(rows[i-1].tx_date) - new Date(rows[i].tx_date)) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

async function recordTransaction(client, type, data) {
  const tx = await db.insert(`
    INSERT INTO transactions
      (client_id, phone, type, amount, quantity, item, person, bank, contrib_type, raw_message, lang_detected)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [client.id, client.phone, type, data.amount||0, data.quantity||null,
      data.item||null, data.person||null, data.bank||null, data.contrib_type||null,
      data.raw_message||'', data.lang||'en']);

  await db.query(`
    UPDATE clients SET total_transactions=total_transactions+1,
      last_activity_at=NOW(), last_transaction_date=CURRENT_DATE WHERE id=$1
  `, [client.id]);

  // Log command
  await db.query(`
    INSERT INTO command_logs(client_id, phone, raw_command, parsed_action, status, lang_detected)
    VALUES($1,$2,$3,$4,'success',$5)
  `, [client.id, client.phone, data.raw_message||'', type, data.lang||'en']).catch(()=>{});

  // Non-blocking sheets write
  sheets.appendTransaction(client, tx).catch(err =>
    console.error('⚠️  Sheets write (non-fatal):', err.message)
  );

  return tx;
}

async function checkMilestones(client, monthSales) {
  const messages = [];
  const alreadyEarned = async (type) => !!(await db.getOne(
    `SELECT id FROM milestones WHERE client_id=$1 AND milestone_type=$2`, [client.id, type]
  ));
  const earn = async (type, value, msg) => {
    if (await alreadyEarned(type)) return;
    await db.query(`INSERT INTO milestones(client_id,milestone_type,milestone_value) VALUES($1,$2,$3)`, [client.id, type, value]);
    messages.push(msg);
  };
  const total = client.total_transactions + 1;
  if (total === 1)          await earn('first_transaction', 1,   '🎉 *First transaction ever!* Welcome to LedgerFlow!');
  if (total === 10)         await earn('tx_10', 10,              '🏅 *10 transactions!* You\'re building a habit!');
  if (total === 100)        await earn('tx_100', 100,            '🏆 *100 transactions!* Serious business!');
  if (total === 500)        await earn('tx_500', 500,            '💎 *500 transactions!* UNSTOPPABLE!');
  if (monthSales >= 100000) await earn('month_100k', 100000,     '🚀 *₦100k this month!* Incredible!');
  if (monthSales >= 1000000)await earn('month_1M',  1000000,     '👑 *₦1 MILLION this month!* LEGEND!');
  return messages;
}

// ─────────────────────────────────────────────────────────────
// COMMAND HANDLERS
// ─────────────────────────────────────────────────────────────

async function handleSale(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  await recordTransaction(client, 'SALE', { ...cmd, lang });
  const today  = await getTodayStats(client.id);
  const month  = await getMonthStats(client.id);
  const streak = await calculateStreak(client.id);
  const milestones = await checkMilestones(client, parseFloat(month.sales));
  const profit = parseFloat(today.sales) - parseFloat(today.expenses);
  const margin = profitMargin(today.sales, today.expenses);

  let r = `${t(lang,'sale_ok')} 🎯\n━━━━━━━━━━━━━━━━━━\n`;
  r += `📦 *Item:* ${cmd.item}\n💰 *Amount:* ${fmt(cmd.amount,sym)}\n🕐 ${fmtTime()} | ${fmtDate()}\n\n`;
  r += `${t(lang,'today_snap')}\n`;
  r += `Sales    ↑  ${fmt(today.sales,sym)}\nExpenses ↓  ${fmt(today.expenses,sym)}\nProfit  ✨  ${fmt(profit,sym)}`;
  if (margin!==null) r += `  (${margin}% ${marginEmoji(margin)})`;
  if (streak>=2) r += `\n\n${t(lang,'streak',{n:streak})}`;
  if (milestones.length) r += `\n\n${milestones.join('\n')}`;
  r += `\n\n_Type *BAL* for full balance_`;
  return { reply: r };
}

async function handleExpense(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  await recordTransaction(client, 'EXPENSE', { ...cmd, lang });
  const today  = await getTodayStats(client.id);
  const profit = parseFloat(today.sales) - parseFloat(today.expenses);
  const margin = profitMargin(today.sales, today.expenses);

  let r = `${t(lang,'expense_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `🏷️  *Item:* ${cmd.item}\n💸 *Amount:* ${fmt(cmd.amount,sym)}\n🕐 ${fmtTime()} | ${fmtDate()}\n\n`;
  r += `📊 *Today's Margin*\nSales: ${fmt(today.sales,sym)} | Expenses: ${fmt(today.expenses,sym)}\nProfit: ${fmt(profit,sym)}`;
  if (margin!==null) r += ` (${margin}% ${marginEmoji(margin)})`;
  if (margin!==null && margin<20) r += `\n\n⚠️ _Expenses eating into profit_`;
  r += `\n\n_Type *BAL* for full balance_`;
  return { reply: r };
}

async function handleStock(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  // "STOCK 10 RICE BAGS" — quantity = first number, item = rest
  await recordTransaction(client, 'STOCK', { ...cmd, quantity: cmd.amount, amount: 0, lang });

  // Update stock_inventory
  await db.query(`
    INSERT INTO stock_inventory(client_id, item_name, quantity)
    VALUES($1,$2,$3)
    ON CONFLICT(client_id, item_name) DO UPDATE SET
      quantity = stock_inventory.quantity + $3, updated_at=NOW()
  `, [client.id, cmd.item, cmd.amount]).catch(()=>{});

  let r = `${t(lang,'stock_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `📦 *Item:* ${cmd.item}\n🔢 *Qty Added:* ${cmd.amount} units\n🕐 ${fmtTime()}\n\n`;
  r += `_Type *STOCK BALANCE* to see all stock_`;
  return { reply: r };
}

async function handleCredit(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  await recordTransaction(client, 'CREDIT', { ...cmd, item: cmd.person, lang });

  const existing = await db.getOne(
    `SELECT * FROM credits WHERE client_id=$1 AND UPPER(debtor_name)=UPPER($2) AND status IN ('open','partial')`,
    [client.id, cmd.person]
  );
  if (existing) {
    await db.query(`UPDATE credits SET original_amount=original_amount+$1, balance_owed=balance_owed+$1, updated_at=NOW() WHERE id=$2`,
      [cmd.amount, existing.id]);
  } else {
    await db.query(`INSERT INTO credits(client_id, debtor_name, original_amount, balance_owed) VALUES($1,$2,$3,$3)`,
      [client.id, cmd.person, cmd.amount]);
  }

  const openCredits = await getOpenCredits(client.id);
  let r = `${t(lang,'credit_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `👤 *Person:* ${cmd.person}\n🔴 *Owes:* ${fmt(cmd.amount,sym)}\n🕐 ${fmtTime()}\n\n`;
  r += `📋 Total owed by ${openCredits.count} ${openCredits.count==1?'person':'people'}: *${fmt(openCredits.total,sym)}*\n\n`;
  r += `_Type *CREDIT LIST* to see all debtors_`;
  return { reply: r };
}

async function handlePayment(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  await recordTransaction(client, 'PAYMENT', { ...cmd, item: cmd.person, lang });

  const credit = await db.getOne(
    `SELECT * FROM credits WHERE client_id=$1 AND UPPER(debtor_name)=UPPER($2) AND status IN ('open','partial')`,
    [client.id, cmd.person]
  );
  let newBalance = null;
  if (credit) {
    newBalance = parseFloat(credit.balance_owed) - cmd.amount;
    await db.query(`UPDATE credits SET amount_paid=amount_paid+$1, balance_owed=GREATEST(0,balance_owed-$1), status=$2, updated_at=NOW() WHERE id=$3`,
      [cmd.amount, newBalance<=0?'settled':'partial', credit.id]);
  }

  let r = `${t(lang,'payment_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `👤 *From:* ${cmd.person}\n💚 *Paid:* ${fmt(cmd.amount,sym)}\n🕐 ${fmtTime()}\n`;
  if (newBalance!==null) {
    r += newBalance<=0 ? `\n🎉 *${cmd.person} has fully settled their debt!*` : `\n📋 *Remaining:* ${fmt(newBalance,sym)}`;
  }
  r += `\n\n_Type *CREDIT LIST* to see all outstanding_`;
  return { reply: r };
}

async function handleCapital(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  await recordTransaction(client, 'CAPITAL', { ...cmd, item:'CAPITAL INJECTION', lang });
  const totalCap = await db.getOne(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE client_id=$1 AND type='CAPITAL'`, [client.id]);

  let r = `${t(lang,'capital_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `💼 *Added:* ${fmt(cmd.amount,sym)}\n🏦 *Total Capital:* ${fmt(totalCap.total,sym)}\n🕐 ${fmtTime()}\n\n`;
  r += `_Capital is the foundation of your business._`;
  return { reply: r };
}

async function handleWithdraw(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  // WITHDRAW AMOUNT — amount is in cmd.amount (parsed from first token)
  const amount = cmd.amount || parseFloat(cmd.item) || 0;
  await recordTransaction(client, 'WITHDRAW', { ...cmd, amount, item:'WITHDRAWAL', lang });
  const today = await getTodayStats(client.id);

  let r = `${t(lang,'withdraw_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `🏧 *Amount:* ${fmt(amount,sym)}\n🕐 ${fmtTime()} | ${fmtDate()}\n\n`;
  r += `_Withdrawal recorded in your books_\n_Type *REPORT* to see today's full summary_`;
  return { reply: r };
}

async function handleTransfer(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  await recordTransaction(client, 'TRANSFER', { ...cmd, bank: cmd.item, lang });

  let r = `${t(lang,'transfer_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `🏦 *Bank/Dest:* ${cmd.item}\n💳 *Amount:* ${fmt(cmd.amount,sym)}\n🕐 ${fmtTime()}\n\n`;
  r += `_Transfer recorded. Type *REPORT* for today's summary_`;
  return { reply: r };
}

async function handleContrib(client, cmd, lang) {
  const sym  = client.currency_symbol || '₦';
  const type = ['DAILY','WEEKLY','MONTHLY'].includes((cmd.item||'').toUpperCase())
    ? cmd.item.toUpperCase() : 'DAILY';
  await recordTransaction(client, 'CONTRIB', { ...cmd, contrib_type: type, item:`CONTRIBUTION_${type}`, lang });

  let r = `${t(lang,'contrib_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `📅 *Type:* ${type}\n💰 *Amount:* ${fmt(cmd.amount,sym)}\n🕐 ${fmtTime()}\n\n`;
  r += `_Savings contribution recorded!_`;
  return { reply: r };
}

async function handleDrugStock(client, cmd, lang) {
  const sym = client.currency_symbol || '₦';
  const tokens = cmd.item.split(' ');
  const cost    = parseFloat(tokens[tokens.length-1]) || 0;
  const drugName = tokens.slice(0, -1).join(' ') || cmd.item;

  await recordTransaction(client, 'DRUGSTOCK', { ...cmd, item: drugName, quantity: cmd.amount, amount: cost, lang });

  await db.query(`
    INSERT INTO drug_inventory(client_id, name, quantity, cost)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(client_id, name) DO UPDATE SET
      quantity=drug_inventory.quantity+$3, updated_at=NOW()
  `, [client.id, drugName.toUpperCase(), cmd.amount, cost]).catch(()=>{});

  let r = `${t(lang,'drugstock_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `💊 *Drug:* ${drugName.toUpperCase()}\n📦 *Qty Added:* ${cmd.amount}\n💰 *Cost:* ${fmt(cost,sym)}\n🕐 ${fmtTime()}\n\n`;
  r += `_Stock updated. Use DRUGSALE when dispensing._`;
  return { reply: r };
}

async function handleDrugSale(client, cmd, lang) {
  const sym  = client.currency_symbol || '₦';
  const tokens = cmd.item.split(' ');
  const qty    = parseFloat(tokens[tokens.length-1]) || 1;
  const drugName = tokens.slice(0, -1).join(' ') || cmd.item;

  await recordTransaction(client, 'DRUGSALE', { ...cmd, item: drugName, quantity: qty, lang });

  await db.query(`
    UPDATE drug_inventory SET quantity=GREATEST(0,quantity-$1), updated_at=NOW()
    WHERE client_id=$2 AND UPPER(name)=UPPER($3)
  `, [qty, client.id, drugName]).catch(()=>{});

  let r = `${t(lang,'drugsale_ok')}\n━━━━━━━━━━━━━━━━━━\n`;
  r += `💊 *Drug:* ${drugName.toUpperCase()}\n📦 *Qty Sold:* ${qty}\n💰 *Amount:* ${fmt(cmd.amount,sym)}\n🕐 ${fmtTime()}\n\n`;
  r += `_Sale recorded. Type REPORT for today's summary._`;
  return { reply: r };
}

async function handleBalance(client, lang) {
  const sym    = client.currency_symbol || '₦';
  const today  = await getTodayStats(client.id);
  const month  = await getMonthStats(client.id);
  const credits = await getOpenCredits(client.id);
  const streak = await calculateStreak(client.id);
  const margin = profitMargin(month.sales, month.expenses);
  const todayProfit = parseFloat(today.sales) - parseFloat(today.expenses);
  const monthProfit = parseFloat(month.sales)  - parseFloat(month.expenses);

  let health = 100;
  if (parseFloat(month.expenses) > parseFloat(month.sales) * 0.7) health -= 25;
  if (parseFloat(credits.total)  > parseFloat(month.sales) * 0.5) health -= 20;
  if (streak === 0)    health -= 10;
  if (today.count < 1) health -= 5;
  const hEmoji = health>=80?'🌟':health>=60?'✅':health>=40?'⚡':'⚠️';

  let r = `📊 *LEDGERFLOW SNAPSHOT*\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (client.business_name) r += `🏪 ${client.business_name}\n`;
  r += `📅 ${fmtDate()}\n\n`;
  r += `*TODAY*\n💰 Sales: ${fmt(today.sales,sym)} | 💸 Expenses: ${fmt(today.expenses,sym)}\n✨ Profit: ${fmt(todayProfit,sym)}\n\n`;
  r += `*THIS MONTH*\n💰 Sales: ${fmt(month.sales,sym)} | 💸 Expenses: ${fmt(month.expenses,sym)}\n✨ Profit: ${fmt(monthProfit,sym)}`;
  if (margin!==null) r += ` (${margin}%)`;
  r += `\n`;
  if (parseFloat(credits.total)>0) r += `\n*CREDIT OWED*\n🔴 ${credits.count} people owe: *${fmt(credits.total,sym)}*\n`;
  r += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  r += `⚡ Health: *${health}/100* ${hEmoji}`;
  if (streak>=2) r += ` | 🔥 *${streak}-day streak*`;
  r += `\n\n💡 _${getDailyTip()}_\n━━━━━━━━━━━━━━━━━━━━\n_REPORT · WEEK · MONTH · CREDIT LIST · HELP_`;
  return { reply: r };
}

async function handleReport(client, lang) {
  const sym   = client.currency_symbol || '₦';
  const today = await getTodayStats(client.id);
  const profit = parseFloat(today.sales) - parseFloat(today.expenses);
  const margin = profitMargin(today.sales, today.expenses);
  const topItems = await db.getMany(`
    SELECT item, SUM(amount) AS total, COUNT(*) AS count
    FROM transactions WHERE client_id=$1 AND type='SALE'
      AND DATE(created_at AT TIME ZONE 'Africa/Lagos')=CURRENT_DATE
    GROUP BY item ORDER BY total DESC LIMIT 3
  `, [client.id]);

  let r = `📈 *TODAY'S REPORT*\n━━━━━━━━━━━━━━━━━━━━\n📅 ${fmtDate()}\n\n`;
  r += `💰 Sales: ${fmt(today.sales,sym)} (${today.count} entries)\n`;
  r += `💸 Expenses: ${fmt(today.expenses,sym)}\n`;
  r += `✨ Profit: ${fmt(profit,sym)}`;
  if (margin!==null) r += ` | ${margin}% ${marginEmoji(margin)}`;
  if (topItems.length) {
    r += `\n\n*TOP SELLERS TODAY*\n`;
    topItems.forEach((item,i) => r += `${['🥇','🥈','🥉'][i]} ${item.item}: ${fmt(item.total,sym)}\n`);
  }
  if (!today.count) r += `\n\n⚠️ _No transactions today. Start: SALE 5000 RICE_`;
  return { reply: r };
}

async function handleWeek(client, lang) {
  const sym  = client.currency_symbol || '₦';
  const week = await db.getOne(`
    SELECT
      COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END),0) AS sales,
      COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END),0) AS expenses,
      COUNT(*) AS count,
      COUNT(DISTINCT DATE(created_at AT TIME ZONE 'Africa/Lagos')) AS active_days
    FROM transactions
    WHERE client_id=$1 AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Africa/Lagos')
  `, [client.id]);
  const last = await db.getOne(`
    SELECT COALESCE(SUM(CASE WHEN type='SALE' THEN amount END),0) AS sales
    FROM transactions
    WHERE client_id=$1
      AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Africa/Lagos') - INTERVAL '7 days'
      AND created_at <  DATE_TRUNC('week', NOW() AT TIME ZONE 'Africa/Lagos')
  `, [client.id]);

  const profit = parseFloat(week.sales) - parseFloat(week.expenses);
  const vsLast = parseFloat(last.sales) > 0 ? Math.round(((parseFloat(week.sales)-parseFloat(last.sales))/parseFloat(last.sales))*100) : null;

  let r = `📅 *THIS WEEK*\n━━━━━━━━━━━━━━━━━━━━\n`;
  r += `💰 Sales: ${fmt(week.sales,sym)} | 💸 Expenses: ${fmt(week.expenses,sym)}\n`;
  r += `✨ Profit: ${fmt(profit,sym)} | 📆 Active: ${week.active_days}/7 days\n`;
  if (vsLast!==null) {
    const arrow = vsLast>=0?'↑':'↓';
    r += `\n${vsLast>=0?'📈':'📉'} *vs Last Week: ${arrow}${Math.abs(vsLast)}%*\n`;
    r += vsLast>=0 ? `_Ahead of last week!_` : `_Last week was stronger — bounce back!_`;
  }
  return { reply: r };
}

// GAP-09 / FATAL-20 FIX: MONTH command handler
async function handleMonth(client, lang) {
  const sym   = client.currency_symbol || '₦';
  const month = await getMonthStats(client.id);
  const profit = parseFloat(month.sales) - parseFloat(month.expenses);
  const margin = profitMargin(month.sales, month.expenses);
  const monthName = new Date().toLocaleString('en-NG', { month:'long', year:'numeric', timeZone:'Africa/Lagos' });

  let r = `📊 *MONTHLY REPORT — ${monthName}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  r += `💰 Sales:      ${fmt(month.sales,sym)}\n`;
  r += `💸 Expenses:   ${fmt(month.expenses,sym)}\n`;
  r += `✨ Net Profit: ${fmt(profit,sym)}`;
  if (margin!==null) r += ` (${margin}%)`;
  r += `\n💼 Capital:    ${fmt(month.capital,sym)}\n`;
  if (parseFloat(month.withdrawals)>0) r += `🏧 Withdrawals: ${fmt(month.withdrawals,sym)}\n`;
  r += `📝 Transactions: ${month.count}\n`;
  r += `📆 Active Days: ${month.active_days}/~30\n\n`;
  r += `_${getDailyTip()}_`;
  return { reply: r };
}

async function handleCreditList(client, lang) {
  const sym = client.currency_symbol || '₦';
  const credits = await db.getMany(`
    SELECT debtor_name, balance_owed, original_amount, created_at
    FROM credits WHERE client_id=$1 AND status IN ('open','partial')
    ORDER BY balance_owed DESC LIMIT 15
  `, [client.id]);

  if (!credits.length) return { reply:'✅ *No outstanding credits!*\nEveryone has paid up. 🎉' };

  const total = credits.reduce((s,c) => s + parseFloat(c.balance_owed), 0);
  let r = `🔴 *OUTSTANDING CREDIT LIST*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  credits.forEach(c => {
    const days = Math.floor((Date.now()-new Date(c.created_at))/86400000);
    const urgency = days>30?'🔴':days>14?'🟡':'🟢';
    r += `${urgency} *${c.debtor_name}* — ${fmt(c.balance_owed,sym)} (${days}d ago)\n`;
  });
  r += `\n━━━━━━━━━━━━━━━━━━━━\n💰 *Total: ${fmt(total,sym)}* | 👥 ${credits.length} debtors\n`;
  r += `\n_PAYMENT 5000 JOHN — to record a payment_`;
  return { reply: r };
}

// GAP-08 FIX: STOCK BALANCE
async function handleStockBalance(client, lang) {
  const stocks = await db.getMany(`
    SELECT item_name, quantity, low_stock_alert, updated_at
    FROM stock_inventory WHERE client_id=$1 ORDER BY quantity ASC
  `, [client.id]);
  const drugs = await db.getMany(`
    SELECT name, quantity, low_stock_alert FROM drug_inventory WHERE client_id=$1 ORDER BY quantity ASC
  `, [client.id]);

  if (!stocks.length && !drugs.length) {
    return { reply:'📦 No stock recorded yet.\n_Add stock: STOCK 10 RICE BAGS_' };
  }

  let r = `📦 *STOCK BALANCE*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (stocks.length) {
    r += `*PRODUCTS*\n`;
    stocks.forEach(s => {
      const alert = s.quantity <= s.low_stock_alert ? ' ⚠️ LOW' : '';
      r += `• ${s.item_name}: *${s.quantity} units*${alert}\n`;
    });
  }
  if (drugs.length) {
    r += `\n*DRUGS/MEDICINES*\n`;
    drugs.forEach(d => {
      const alert = d.quantity <= d.low_stock_alert ? ' ⚠️ LOW' : '';
      r += `• ${d.name}: *${d.quantity}*${alert}\n`;
    });
  }
  r += `\n_STOCK 10 BAGS — to add more stock_`;
  return { reply: r };
}

async function handleTop(client, lang) {
  const sym   = client.currency_symbol || '₦';
  const items = await db.getMany(`
    SELECT item, SUM(amount) AS revenue, COUNT(*) AS times_sold
    FROM transactions WHERE client_id=$1 AND type='SALE'
      AND DATE_TRUNC('month', created_at AT TIME ZONE 'Africa/Lagos')
          = DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Lagos')
    GROUP BY item ORDER BY revenue DESC LIMIT 5
  `, [client.id]);

  if (!items.length) return { reply:`📦 No sales this month yet.\n_SALE 5000 RICE — to record a sale_` };

  let r = `🏆 *TOP PRODUCTS THIS MONTH*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  items.forEach((item,i) => {
    r += `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} *${item.item}*\n   ${fmt(item.revenue,sym)} | ${item.times_sold}x sold\n\n`;
  });
  r += `_These are your money-makers. Always keep them stocked!_`;
  return { reply: r };
}

async function handleHistory(client, lang) {
  const sym  = client.currency_symbol || '₦';
  const rows = await db.getMany(`
    SELECT type, amount, item, created_at FROM transactions
    WHERE client_id=$1 ORDER BY created_at DESC LIMIT 10
  `, [client.id]);
  if (!rows.length) return { reply:`📋 No transactions yet.\n_SALE 5000 RICE — to start_` };
  const icons = { SALE:'💰', EXPENSE:'💸', STOCK:'📦', CREDIT:'🔴', PAYMENT:'💚', CAPITAL:'💼', WITHDRAW:'🏧', TRANSFER:'🏦', CONTRIB:'💰', DRUGSTOCK:'💊', DRUGSALE:'💊' };
  let r = `📋 *RECENT TRANSACTIONS*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  rows.forEach(row => {
    const d = new Date(row.created_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', timeZone:'Africa/Lagos' });
    r += `${icons[row.type]||'📝'} ${row.type} ${fmt(row.amount,sym)} — ${row.item||''} _${d}_\n`;
  });
  return { reply: r };
}

function handleHelp(client, lang) {
  const sym = client?.currency_symbol || '₦';
  const plan = client?.plan || 'trial';
  return `📖 *LEDGERFLOW COMMANDS*
━━━━━━━━━━━━━━━━━━━━
*Record Transactions:*
SALE 5000 RICE
EXPENSE 1200 FUEL
STOCK 10 RICE BAGS
CREDIT 7000 JOHN
PAYMENT 7000 JOHN
CAPITAL 50000
WITHDRAW 20000
TRANSFER GTB 50000

*Your Reports:*
BAL — Full snapshot
REPORT — Today's report
WEEK — This week
MONTH — This month
CREDIT LIST — Who owes you
STOCK BALANCE — Stock levels
TOP — Best sellers
HISTORY — Recent entries

*Account:*
SUBSTATUS — Check your plan
CONTACT — Get support
HELP — This menu

━━━━━━━━━━━━━━━━━━━━
💡 _Commands work in any language_
📞 Admin: ${process.env.ADMIN_PHONE || 'contact admin'}`;
}

// GAP-12 FIX: START command
function handleStart(client, lang) {
  const name = client?.business_name || client?.owner_name || 'there';
  return `👋 *Welcome to LedgerFlow${client ? ', ' + name : ''}!*\n\n` +
    `Record your business transactions via WhatsApp.\n\n` +
    `*Quick Start:*\n` +
    `SALE 5000 RICE\n` +
    `EXPENSE 1200 FUEL\n` +
    `BAL ← check balance\n\n` +
    `Type *HELP* for all commands 📖`;
}

// FATAL-12/13 FIX: SUBSTATUS + CONTACT
async function handleContact(client, lang) {
  const r = `📞 *LedgerFlow Support*\n\nReply with a number:\n*1* — Subscription/Payment\n*2* — Technical issue\n*3* — Business setup help\n*4* — Speak with agent`;
  return { reply: r };
}

async function handleSupportMenu(option, client, lang) {
  const issues = { '1':'Subscription/Payment', '2':'Technical Issue', '3':'Business Setup', '4':'Speak With Agent' };
  const issue  = issues[option];

  await db.query(`INSERT INTO support_tickets(client_id, phone, issue, status) VALUES($1,$2,$3,'open')`,
    [client.id, client.phone, issue]).catch(()=>{});

  // Notify admin
  await db.query(`INSERT INTO notifications(phone, message, notification_type, status) VALUES($1,$2,'admin_alert','pending')`,
    [process.env.ADMIN_PHONE?.replace(/\D/g,''), `📩 Support Request\nBusiness: ${client.business_name||'Unknown'}\nPhone: ${client.phone}\nIssue: ${issue}`]
  ).catch(()=>{});

  if (option === '4') {
    return { reply:`👤 *Agent request received*\n\nAn agent will contact you shortly.\nIssue: *${issue}*\n\nTypically within 24 hours.` };
  }
  return { reply:`✅ *Support Ticket Created*\n\nIssue: *${issue}*\nOur team will respond shortly.\n\nRef: #${Date.now().toString(36).toUpperCase()}` };
}

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────
async function parseMessage(phone, text, rawMsg = {}) {
  const lang = detectLanguage(text);
  const start = Date.now();

  // 1. Rate limit (in-memory, fast)
  if (isRateLimited(phone)) {
    return { reply: t(lang, 'rate_limited') };
  }

  // 2. Extract command
  const cmd = extractCommand(text);

  // 3. HELP and START don't need client record
  if (cmd.type === 'HELP') {
    const client = await db.getOne(`SELECT * FROM clients WHERE phone=$1`, [phone]).catch(()=>null);
    return { reply: handleHelp(client, lang) };
  }
  if (cmd.type === 'START') {
    const client = await db.getOne(`SELECT * FROM clients WHERE phone=$1`, [phone]).catch(()=>null);
    return { reply: handleStart(client, lang) };
  }

  // 4. Check subscription / module access (also retrieves client)
  const access = await checkModuleAccess(phone, cmd.type);
  if (!access.allowed) {
    return { reply: access.message || t(lang, 'not_found') };
  }

  const client = access.client;

  // Log command (non-blocking)
  db.query(`INSERT INTO command_logs(client_id, phone, raw_command, parsed_action, status, lang_detected, response_ms)
    VALUES($1,$2,$3,$4,'success',$5,$6)`,
    [client.id, phone, text.substring(0,500), cmd.type, lang, Date.now()-start]
  ).catch(()=>{});

  // 5. Dispatch
  cmd.raw_message = text;
  switch (cmd.type) {
    case 'SALE':          return handleSale(client, cmd, lang);
    case 'EXPENSE':       return handleExpense(client, cmd, lang);
    case 'STOCK':         return handleStock(client, cmd, lang);
    case 'CREDIT':        return handleCredit(client, cmd, lang);
    case 'PAYMENT':       return handlePayment(client, cmd, lang);
    case 'CAPITAL':       return handleCapital(client, cmd, lang);
    case 'WITHDRAW':      return handleWithdraw(client, cmd, lang);
    case 'TRANSFER':      return handleTransfer(client, cmd, lang);
    case 'CONTRIB':       return handleContrib(client, cmd, lang);
    case 'DRUGSTOCK':     return handleDrugStock(client, cmd, lang);
    case 'DRUGSALE':      return handleDrugSale(client, cmd, lang);
    case 'BAL':
    case 'BALANCE':       return handleBalance(client, lang);
    case 'REPORT':        return handleReport(client, lang);
    case 'WEEK':          return handleWeek(client, lang);
    case 'MONTH':         return handleMonth(client, lang);
    case 'CREDIT_LIST':   return handleCreditList(client, lang);
    case 'STOCK_BALANCE': return handleStockBalance(client, lang);
    case 'TOP':           return handleTop(client, lang);
    case 'HISTORY':       return handleHistory(client, lang);
    case 'SUBSTATUS':     return { reply: await getSubscriptionStatus(phone) };
    case 'CONTACT':       return handleContact(client, lang);
    case '1': case '2': case '3': case '4':
                          return handleSupportMenu(cmd.type, client, lang);
    default:
      await updateRiskScore(phone, 1).catch(()=>{});
      return { reply: t(lang, 'unknown') };
  }
}

module.exports = { parseMessage, detectLanguage, fmt };
